import {createHash} from 'node:crypto';
import {Decimal,LedgerError,decimalInput,decimalSum,ledgerDate,ledgerAccounts,createPosting,checkBankPostingDate} from './ledger.js';
import {audit} from './audit.js';
import {assertPermission} from './permissions.js';
export const creditDetail={allocations:true,refunds:true};
export function remainingCredit(credit){return credit.reversalEntryId?new Decimal(0):new Decimal(credit.amount).minus(decimalSum(credit.allocations.filter(a=>!a.reversedDate).map(a=>a.amount))).minus(decimalSum(credit.refunds.filter(a=>!a.reversedDate).map(a=>a.amount)));}
export const creditResult=c=>({...c,amount:c.amount.toFixed(2),remaining:remainingCredit(c).toFixed(2)});
export async function once(tx,req,operation,run){
 const key=req.body.requestId;if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(key))throw new LedgerError('A stable request key is required. Retry the same action after a connection failure.');
 const fingerprint=createHash('sha256').update(JSON.stringify({operation,body:req.body})).digest('hex');
 const old=await tx.financeAction.findUnique({where:{workspaceId_requestId:{workspaceId:req.workspace.id,requestId:key}}});
 if(old){if(old.fingerprint!==fingerprint)throw new LedgerError('This request key was already used for a different action.',409);return old.result;}
 const result=JSON.parse(JSON.stringify(await run()));await tx.financeAction.create({data:{workspaceId:req.workspace.id,requestId:key,fingerprint,result}});return result;
}
export async function findCredit(tx,workspaceId,id){const credit=await tx.creditBalance.findFirst({where:{id,workspaceId},include:creditDetail});if(!credit)throw new LedgerError('Credit or deposit not found.',404);return credit;}
export function reasonInput(value,label='Reason'){if(typeof value!=='string'||value.trim().length<5||value.trim().length>1000)throw new LedgerError(label+' needs 5–1,000 characters.');return value.trim();}
export async function refreshSettledDocument(tx,kind,id){
 const ar=kind==='AR',model=ar?'invoice':'bill';const d=await tx[model].findUnique({where:{id},include:{payments:true,creditAllocations:true}});
 if(!d||!d.postingEntryId||d.status==='VOID')return;
 const settled=decimalSum([...d.payments.filter(p=>!p.reversalEntryId),...d.creditAllocations.filter(p=>!p.reversedDate)].map(p=>p.amount));
 await tx[model].update({where:{id},data:{status:settled.eq(d.total)?'PAID':ar?'SENT':'RECEIVED'}});
}
export async function allocateCredit(tx,workspace,credit,input,date,actorId){
 assertPermission('post');if(!credit.partyId)throw new LedgerError('Assign this unapplied payment to a customer or supplier before allocating it.');
 if(date<credit.date)throw new LedgerError('Allocation date cannot precede the credit or deposit.');
 if(!Array.isArray(input)||!input.length||input.length>100)throw new LedgerError('Select between one and 100 documents.');
 if(new Set(input.map(a=>a.documentId)).size!==input.length)throw new LedgerError('Enter each document once.');
 const allocations=input.map(a=>({...a,amount:decimalInput(a.amount,'Allocation amount')}));if(allocations.some(a=>a.amount.lte(0)))throw new LedgerError('Allocation amounts must be positive.');
 if(decimalSum(allocations.map(a=>a.amount)).gt(remainingCredit(credit)))throw new LedgerError('Allocations exceed the available credit.',409);
 const ar=credit.kind==='AR',model=ar?'invoice':'bill';
 for(const row of allocations){
  const doc=await tx[model].findFirst({where:{id:row.documentId,workspaceId:workspace.id,[ar?'customerId':'vendorId']:credit.partyId},include:{payments:true,creditAllocations:true,postingEntry:{include:{journalLines:{include:{account:true}}}}}});
  if(!doc||!doc.postingEntry||doc.status==='VOID')throw new LedgerError('Choose a posted document for the same customer or supplier.');
  if(date<doc.postingEntry.date)throw new LedgerError('An allocation cannot precede the document posting date.');
  const control=doc.postingEntry.journalLines.find(l=>l.account.role===(ar?'ACCOUNTS_RECEIVABLE':'ACCOUNTS_PAYABLE'))?.accountId;
  if(!control||credit.source!=='DEPOSIT'&&control!==credit.accountId)throw new LedgerError('Allocate within the same receivable or payable control account.');
  const available=new Decimal(doc.total).minus(decimalSum(doc.payments.filter(p=>!p.reversalEntryId).map(p=>p.amount))).minus(decimalSum(doc.creditAllocations.filter(p=>!p.reversedDate).map(p=>p.amount)));
  if(row.amount.gt(available))throw new LedgerError('Allocation exceeds the remaining document balance.',409);
  const accounts=await ledgerAccounts(tx,workspace.id,[control,credit.accountId]);await checkBankPostingDate(tx,workspace.id,date,accounts);
  let posting;
  if(credit.source==='DEPOSIT')posting=await createPosting(tx,workspace.id,{date,description:'Apply deposit '+credit.reference,referenceNo:credit.reference,lines:ar?[{accountId:credit.accountId,debit:row.amount},{accountId:control,credit:row.amount}]:[{accountId:control,debit:row.amount},{accountId:credit.accountId,credit:row.amount}]});
  await tx.creditAllocation.create({data:{creditId:credit.id,[ar?'invoiceId':'billId']:doc.id,date,amount:row.amount,postingEntryId:posting?.id}});
  await refreshSettledDocument(tx,credit.kind,doc.id);
  await audit(tx,workspace.id,'CREDIT_ALLOCATED',credit.id,{documentId:doc.id,reference:credit.reference,amount:row.amount,date,currency:workspace.currency,postingEntryId:posting?.id},undefined,actorId);
 }
 return creditResult(await findCredit(tx,workspace.id,credit.id));
}
