import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {test} from 'node:test';import sharp from 'sharp';
const root=process.env.ACCOUNTING_TEST_API;const options={skip:!root&&'Set ACCOUNTING_TEST_API to disposable localhost with stub OCR.'};
async function fixture(){
 assert.ok(['localhost','127.0.0.1'].includes(new URL(root).hostname));
 const r=await fetch(root+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Receipt correction fixture',email:randomUUID()+'@example.test',password:'disposable-test-only'})});assert.equal(r.status,201);const session=await r.json();
 const headers={Authorization:'Bearer '+session.token,'x-workspace-id':session.workspace.id};
 const api=async(path,method='GET',body,status=200)=>{const multi=body instanceof FormData;const res=await fetch(root+'/api'+path,{method,headers:{...headers,...(!multi&&{'Content-Type':'application/json'})},body:body===undefined?undefined:multi?body:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,status,path+': '+JSON.stringify(data));return data;};
 const createAccount=(code,type,role='GENERAL')=>api('/accounts','POST',{code,name:'Fixture '+code,type,role},201);
 const bank=await createAccount('1000','ASSET','BANK');const expense=await createAccount('6000','EXPENSE');
 const upload=async()=>{const png=await sharp(randomBytes(12*12*3),{raw:{width:12,height:12,channels:3}}).png().toBuffer();const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'fixture.png');return api('/receipts/upload','POST',form,201);};
 return {api,bank,expense,upload,headers};
}
test('a receipt correction preserves source history, is repeat-safe and posts replacement on its correction date',options,async()=>{
 const f=await fixture();const receipt=await f.upload();const path='/receipts/'+receipt.id;
 const extractedData={vendor:'Fixture supplier',invoiceNumber:'COR-01',invoiceDate:'2026-02-01',total:'40',amountPaid:'40',balanceDue:'0',tax:'0',tip:'0',items:[]};
 await f.api(path,'PUT',{extractedData});const posted=await f.api(path+'/approve','POST',{expenseAccountId:f.expense.id,paymentAccountId:f.bank.id,paidInFull:true,confirmedTotal:'40'});
 const input={date:'2026-02-03',reason:'Fixture incorrect amount correction',createReplacement:true,requestId:randomUUID()};
 const [a,b]=await Promise.all([f.api(path+'/correct','POST',input),f.api(path+'/correct','POST',input)]);
 assert.equal(a.status,'REVERSED');assert.equal(a.correction.reversalEntryId,b.correction.reversalEntryId);assert.equal(a.replacement.id,b.replacement.id);
 assert.equal(a.journalEntry.id,posted.journalEntry.id);assert.equal(a.extractedData.total,'40');
 const replacement=await f.api('/receipts/'+a.replacement.id);assert.equal(replacement.status,'PENDING');assert.equal(replacement.postingDate.slice(0,10),'2026-02-03');assert.equal(replacement.extractedData.invoiceDate,'2026-02-01');
 const image=await fetch(root+'/api/receipts/'+replacement.id+'/image',{headers:f.headers});assert.equal(image.status,200);assert.match(image.headers.get('Content-Type'),/image/);
 await f.api(path+'/correct','POST',{...input,reason:'Different correction should fail'},409);
 await f.api('/receipts/'+replacement.id,'PUT',{extractedData:{...extractedData,total:'35',amountPaid:'35'}});
 const corrected=await f.api('/receipts/'+replacement.id+'/approve','POST',{expenseAccountId:f.expense.id,paymentAccountId:f.bank.id,paidInFull:true,confirmedTotal:'35'});assert.equal(corrected.journalEntry.date.slice(0,10),'2026-02-03');
 const before=await f.api('/reports/profit-loss?endDate=2026-02-02');const after=await f.api('/reports/profit-loss?endDate=2026-02-03');assert.equal(before.totalExpenses,'40.00');assert.equal(after.totalExpenses,'35.00');
 const history=await f.api(path);assert.equal(history.correction.reason,input.reason);assert.equal(history.replacement.id,replacement.id);
});

test('wrong bill evidence is superseded without a duplicate financial posting',options,async()=>{
 const f=await fixture();const vendor=await f.api('/vendors','POST',{name:'Evidence fixture supplier'},201);const bill=await f.api('/bills','POST',{vendorId:vendor.id,date:'2026-02-01',dueDate:'2026-02-28',lines:[{description:'Supplies',quantity:1,unitPrice:'40',accountId:f.expense.id}]},201);
 const receipt=await f.upload();await f.api('/receipts/'+receipt.id,'PUT',{extractedData:{invoiceDate:'2026-02-01',total:'40'}});await f.api('/receipts/'+receipt.id+'/attach-to-bill','POST',{billId:bill.id});
 const original=await f.api('/journal-entries');const result=await f.api('/receipts/'+receipt.id+'/correct','POST',{date:'2026-02-03',reason:'Fixture attachment was to wrong bill',createReplacement:true,requestId:randomUUID()});
 assert.equal(result.correction.kind,'EVIDENCE_SUPERSEDED');assert.equal(result.correction.reversalEntryId,null);assert.equal(result.billId,bill.id);
 const replacement=await f.api('/receipts/'+result.replacement.id);assert.equal(replacement.billId,null);assert.equal(replacement.status,'PENDING');assert.equal((await f.api('/journal-entries')).length,original.length);
});
