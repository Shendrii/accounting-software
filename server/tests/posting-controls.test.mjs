import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PrismaClient} from '@prisma/client';
const root=process.env.ACCOUNTING_TEST_API,db=process.env.ACCOUNTING_TEST_DATABASE_URL;
test('posting roles are live, journals retain actors, and review/owner overrides cannot be bypassed',{skip:(!root||!db)&&'Set the disposable API and database URLs.'},async()=>{
  for(const value of [root,db])assert.ok(['127.0.0.1','localhost'].includes(new URL(value).hostname));
  const prisma=new PrismaClient({datasources:{db:{url:db}}});
  const signup=async()=>{const r=await fetch(root+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Controls fixture',email:randomUUID()+'@example.test',password:'disposable-test-only'})});assert.equal(r.status,201);return r.json();};
  try{
    const owner=await signup(),member=await signup(),reviewer=await signup(),viewer=await signup();
    const api=async(actor,path,method='GET',body,status=200)=>{const r=await fetch(root+'/api'+path,{method,headers:{Authorization:'Bearer '+actor.token,'x-workspace-id':owner.workspace.id,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=r.status===204?null:await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(value));return value;};
    for(const [user,role] of [[member,'MEMBER'],[reviewer,'APPROVER'],[viewer,'VIEWER']])await prisma.workspaceMember.create({data:{workspaceId:owner.workspace.id,userId:user.user.id,role}});
    await api(owner,'/workspace-settings','PUT',{legalName:'Controls',country:'PH',currency:'PHP',entityType:'SOLE_PROPRIETOR',booksStartDate:'2026-02-01',fiscalYearStartMonth:1,accountingBasis:'ACCRUAL',taxSettings:{vatStatus:'NON_VAT',withholdingAgent:false},createChart:true});
    await api(owner,'/workspace-settings/opening-balances','POST',{requestId:randomUUID(),confirmZero:true},201);
    const accounts=await api(owner,'/accounts');
    const lines=[{accountId:accounts.find(a=>a.code==='6000').id,debit:'10'},{accountId:accounts.find(a=>a.code==='3000').id,credit:'10'}];
    const draft=await api(member,'/journal-entries','POST',{date:'2026-02-02',description:'Reviewer control',journalLines:lines},201);
    await api(member,'/journal-entries/'+draft.id,'PUT',{status:'POSTED'},403);
    await api(member,'/journal-entries/'+draft.id+'/post','POST',{},403);
    await api(viewer,'/journal-entries','POST',{date:'2026-02-02',description:'Read only',journalLines:lines},403);
    await api(owner,'/workspace-settings/controls','PUT',{memberCanPost:false,requireJournalApproval:true,separateCloseReviewer:false,reason:'Test independent posting review.'});
    await api(member,'/journal-entries/'+draft.id,'PUT',{description:'Bookkeeper prepared evidence'});
    const posted=await api(reviewer,'/journal-entries/'+draft.id+'/post','POST',{});
    assert.equal(posted.createdById,member.user.id);assert.equal(posted.postedById,reviewer.user.id);assert.ok(posted.postedAt);
    const ownDraft=await api(reviewer,'/journal-entries','POST',{date:'2026-02-03',description:'Self approval test',journalLines:lines},201);
    await api(reviewer,'/journal-entries/'+ownDraft.id+'/post','POST',{},403);
    const m=await prisma.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:owner.workspace.id,userId:member.user.id}}});
    await api(owner,'/workspaces/'+owner.workspace.id+'/members/'+m.id,'PUT',{role:'VIEWER'});
    await api(member,'/journal-entries/'+ownDraft.id,'PUT',{description:'Stale role must fail'},403);
    const events=await api(viewer,'/audit');assert.ok(events.items.some(e=>e.action==='MANUAL_JOURNAL_POSTED'));
    const event=events.items.find(e=>e.action==='MANUAL_JOURNAL_POSTED');const detail=await api(viewer,'/audit/'+event.id);assert.equal(detail.actorId,reviewer.user.id);
    await api(viewer,'/reports/trial-balance?endDate=2026-02-28');
    const ownerMembership=await prisma.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:owner.workspace.id,userId:owner.user.id}}});
    await api(owner,'/workspaces/'+owner.workspace.id+'/members/'+ownerMembership.id,'PUT',{role:'MEMBER'},403);
  }finally{await prisma.$disconnect();}
});
