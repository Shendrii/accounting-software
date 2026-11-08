import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
const root=process.env.ACCOUNTING_TEST_API;
const options={skip:!root&&'Set ACCOUNTING_TEST_API to a disposable localhost backend.'};
async function fixture() {
  assert.ok(['127.0.0.1','localhost'].includes(new URL(root).hostname));
  const signup=await fetch(root+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Close fixture',email:randomUUID()+'@example.test',password:'disposable-test-only'})});assert.equal(signup.status,201);const session=await signup.json();
  const api=async(path,method='GET',body,status=200,workspaceId=session.workspace.id)=>{
    const response=await fetch(root+'/api'+path,{method,headers:{Authorization:'Bearer '+session.token,'x-workspace-id':workspaceId,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=response.status===204?null:await response.json();assert.equal(response.status,status,path+': '+JSON.stringify(data));return data;
  };
  await api('/workspace-settings','PUT',{legalName:'Close fixture',country:'PH',currency:'PHP',entityType:'SOLE_PROPRIETOR',booksStartDate:'2026-02-01',fiscalYearStartMonth:1,accountingBasis:'ACCRUAL',taxSettings:{vatStatus:'NON_VAT',withholdingAgent:false},createChart:true});
  await api('/workspace-settings/opening-balances','POST',{requestId:randomUUID(),balances:[{accountCode:'1010',debit:'100'},{accountCode:'1100',debit:'10'},{accountCode:'3000',credit:'110'}],receivables:[{partyName:'Overdue client',reference:'OLD-AR',date:'2026-01-01',dueDate:'2026-01-31',amount:'10',accountCode:'1100'}]},201);
  const accounts=await api('/accounts');
  const period=await api('/periods','POST',{startDate:'2026-02-01',endDate:'2026-02-28',targetDate:'2026-03-05'},201);
  async function reviewAll() {
    const state=await api('/periods/'+period.id);
    for(const account of state.accounts) await api('/periods/'+period.id+'/accounts/'+account.id,'PUT',{status:['BANK','CREDIT_CARD'].includes(account.role)?'WAIVED':'RECONCILED',ownerId:session.user.id,dueDate:'2026-03-05',support:'Fixture workpaper TB-01',reason:'Explicit fixture-only bank waiver; no real bank statement exists.',fingerprint:account.fingerprint});
    return api('/periods/'+period.id);
  }
  const journal=async(date)=>api('/journal-entries','POST',{date,description:'Close test',journalLines:[{accountId:accounts.find(row=>row.code==='6000').id,debit:'1'},{accountId:accounts.find(row=>row.code==='3000').id,credit:'1'}]},201);
  return {api,session,period,accounts,reviewAll,journal};
}

test('close derives full account coverage, verifies evidence, preserves overdue AR, and locks nonbank postings',options,async()=>{
  const f=await fixture();const initial=await f.api('/periods/'+f.period.id);assert.equal(initial.canClose,false);assert.ok(initial.accounts.some(row=>row.role==='BANK'));assert.equal(initial.gates.receivables,true);
  await f.api('/periods/'+f.period.id+'/close','POST',{},409);
  const bank=initial.accounts.find(row=>row.role==='BANK');
  await f.api('/periods/'+f.period.id+'/accounts/'+bank.id,'PUT',{status:'RECONCILED',ownerId:f.session.user.id,dueDate:'2026-03-05',support:'Missing statement test',reason:'',fingerprint:bank.fingerprint},400);
  const state=await f.reviewAll();assert.equal(state.canClose,true);assert.equal(state.ar.ledgerBalance,'10.00');
  await f.api('/periods/'+f.period.id+'/close','POST',{});
  const saved=await f.api('/periods/'+f.period.id);assert.equal(saved.savedProof,true);assert.equal(saved.status,'CLOSED');assert.equal(saved.ar.ledgerBalance,'10.00');
  const draft=await f.journal('2026-02-15');await f.api('/journal-entries/'+draft.id+'/post','POST',{},409);
  await f.api('/periods/'+f.period.id+'/accounts/'+bank.id,'PUT',{status:'WAIVED',ownerId:f.session.user.id,dueDate:'2026-03-05',reason:'Cannot edit closed evidence',support:'',fingerprint:bank.fingerprint},409);
  const next=await f.journal('2026-03-01');await f.api('/journal-entries/'+next.id+'/post','POST',{});
});

test('changed balances invalidate reviews, overlapping dates fail, and reopening forces later reviews again',options,async()=>{
  const f=await fixture();await f.reviewAll();const draft=await f.journal('2026-02-20');await f.api('/journal-entries/'+draft.id+'/post','POST',{});
  const changed=await f.api('/periods/'+f.period.id);assert.equal(changed.canClose,false);assert.ok(changed.accounts.some(row=>row.stale));
  await f.api('/periods','POST',{startDate:'2026-02-15',endDate:'2026-03-15',targetDate:'2026-03-16'},409);
  await f.reviewAll();await f.api('/periods/'+f.period.id+'/close','POST',{});
  const later=await f.api('/periods','POST',{startDate:'2026-03-01',endDate:'2026-03-31',targetDate:'2026-04-05'},201);
  const reopened=await f.api('/periods/'+f.period.id+'/reopen','POST',{reason:'Fixture restatement review'});assert.ok(reopened.reopened.includes(later.id));
  assert.equal((await f.api('/periods/'+f.period.id)).canClose,false);
  const after=await f.journal('2026-02-25');await f.api('/journal-entries/'+after.id+'/post','POST',{});
});

test('period data and review assignments remain workspace scoped',options,async()=>{
  const a=await fixture();const b=await fixture();
  await a.api('/periods/'+b.period.id,'GET',undefined,404);
  const state=await a.api('/periods/'+a.period.id);const account=state.accounts[0];
  await a.api('/periods/'+a.period.id+'/accounts/'+account.id,'PUT',{status:'WAIVED',ownerId:b.session.user.id,dueDate:'2026-03-05',support:'',reason:'Invalid assignment test',fingerprint:account.fingerprint},400);
});

test('a close and a new payment cannot both commit against the same reviewed balances',options,async()=>{
  const f=await fixture();await f.reviewAll();
  const report=await f.api('/reports/aging?asOf=2026-02-28&kind=receivables');
  const post=(path,body)=>fetch(root+'/api'+path,{method:'POST',headers:{Authorization:'Bearer '+f.session.token,'x-workspace-id':f.session.workspace.id,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const [close,payment]=await Promise.all([post('/periods/'+f.period.id+'/close',{}),post('/invoices/'+report.items[0].id+'/record-payment',{amount:'1',date:'2026-02-15',paymentAccountId:f.accounts.find(row=>row.role==='BANK').id,requestId:randomUUID()})]);
  assert.ok([200,409].includes(close.status),await close.text());assert.ok([200,409].includes(payment.status),await payment.text());
  assert.equal(close.status===200&&payment.status===200,false,'The reviewed snapshot must not close while a payment changes it.');
});
