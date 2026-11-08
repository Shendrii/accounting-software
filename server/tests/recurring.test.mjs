import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {test} from 'node:test';
import {Decimal} from '../src/lib/ledger.js';
import {advance,occurrences,scheduleInput} from '../src/lib/recurrence.js';
const root=process.env.ACCOUNTING_TEST_API;const options={skip:!root&&'Set ACCOUNTING_TEST_API to a disposable localhost backend.'};
test('month-end, quarterly and leap-year schedules clamp then restore the selected day',()=>{
 assert.deepEqual(occurrences('2026-01-31','monthly',31),['2026-01-31','2026-02-28','2026-03-31']);
 assert.deepEqual(occurrences('2026-01-31','quarterly',31),['2026-01-31','2026-04-30','2026-07-31']);
 assert.deepEqual(occurrences('2028-02-29','yearly',29,5),['2028-02-29','2029-02-28','2030-02-28','2031-02-28','2032-02-29']);
 assert.equal(advance(new Date('2026-03-07T00:00:00Z'),'weekly').toISOString(),'2026-03-14T00:00:00.000Z');
 assert.throws(()=>scheduleInput({nextDueDate:'2026-02-31',recurrenceInterval:'monthly'}));
 assert.throws(()=>scheduleInput({nextDueDate:'2026-03-01',recurrenceInterval:'daily'}));
});
async function fixture(){
 assert.ok(['localhost','127.0.0.1'].includes(new URL(root).hostname));
 const r=await fetch(root+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Recurring fixture',email:randomUUID()+'@example.test',password:'disposable-test-only'})});assert.equal(r.status,201);const session=await r.json();
 const api=async(path,method='GET',body,status=200)=>{const res=await fetch(root+'/api'+path,{method,headers:{Authorization:'Bearer '+session.token,'x-workspace-id':session.workspace.id,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,status,path+': '+JSON.stringify(data));return data;};
 const vendor=await api('/vendors','POST',{name:'Fixture recurring vendor'},201);const expense=await api('/accounts','POST',{code:'6000',name:'Fixture expense',type:'EXPENSE',role:'GENERAL'},201);
 const template=()=>api('/bills','POST',{vendorId:vendor.id,date:'2026-01-01',dueDate:'2026-01-11',isRecurring:true,recurrenceInterval:'monthly',recurrenceAnchorDay:31,nextDueDate:'2026-01-31',lines:[{description:'Recurring service',quantity:'1',unitPrice:'25.10',accountId:expense.id}]},201);
 return {api,vendor,template};
}
test('concurrent run retries create one occurrence, keep payment terms and preserve exact next dates',options,async()=>{
 const f=await fixture();const source=await f.template();const input={requestId:randomUUID(),kind:'bill'};
 const [a,b]=await Promise.all([f.api('/recurring/run','POST',input),f.api('/recurring/run','POST',input)]);assert.equal(a.created,1);assert.equal(b.created,1);assert.equal(a.instances[0].id,b.instances[0].id);
 let bill=await f.api('/bills/'+a.instances[0].id);assert.equal(bill.status,'DRAFT');assert.equal(bill.date.slice(0,10),'2026-01-31');assert.equal(bill.dueDate.slice(0,10),'2026-02-10');assert.equal(new Decimal(bill.total).toFixed(2),'25.10');
 const sourceAfter=await f.api('/bills/'+source.id);assert.equal(sourceAfter.nextDueDate.slice(0,10),'2026-02-28');assert.equal(sourceAfter.recurrenceAnchorDay,31);
 const next=await f.api('/recurring/run','POST',{requestId:randomUUID(),kind:'bill'});bill=await f.api('/bills/'+next.instances[0].id);assert.equal(bill.date.slice(0,10),'2026-02-28');assert.equal(bill.dueDate.slice(0,10),'2026-03-10');
 assert.equal((await f.api('/bills/'+source.id)).nextDueDate.slice(0,10),'2026-03-31');assert.equal((await f.api('/journal-entries')).length,0);
 await f.api('/recurring/run','POST',{...input,kind:'all'},409);
 const page=await f.api('/bills?page=1&view=recurring');assert.deepEqual(page.items[0].nextOccurrences,['2026-03-31','2026-04-30','2026-05-31']);
});
test('a failed run rolls back every draft and schedule; the same request can be safely retried',options,async()=>{
 const f=await fixture();const source=await f.template();const inactive=await f.api('/vendors','POST',{name:'Inactive fixture supplier'},201);const other=await f.template();
 await f.api('/bills/'+other.id,'PUT',{vendorId:inactive.id});await f.api('/vendors/'+inactive.id,'PUT',{isActive:false});
 const input={requestId:randomUUID(),kind:'bill'};await f.api('/recurring/run','POST',input,400);
 assert.equal((await f.api('/bills')).length,2);assert.equal((await f.api('/bills/'+source.id)).nextDueDate.slice(0,10),'2026-01-31');
 await f.api('/vendors/'+inactive.id,'PUT',{isActive:true});const result=await f.api('/recurring/run','POST',input);assert.equal(result.created,2);
});
