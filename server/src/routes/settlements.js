import express from 'express';
import prisma from '../db/prisma.js';
import {demand,assertPermission} from '../lib/permissions.js';
import {Decimal,LedgerError,decimalInput,ledgerDate,ledgerAccounts,ledgerTransaction,createPosting,reversePosting,sendLedgerError} from '../lib/ledger.js';
import {creditDetail,creditResult,findCredit,remainingCredit,once,reasonInput,allocateCredit,refreshSettledDocument} from '../lib/settlements.js';
import {audit} from '../lib/audit.js';
import {pageOptions} from '../lib/workbenchQueries.js';
import {checkCorrectionMatch} from '../lib/paymentCorrection.js';
import {taxCode,taxPostingAccount,recordTax} from '../lib/tax.js';
const router=express.Router();
router.get('/',async(req,res)=>{try{const p=pageOptions(req.query),kind=req.query.kind;if(!['AR','AP'].includes(kind))throw new LedgerError('Choose customers or suppliers.');const where={workspaceId:req.workspace.id,kind,...(p.q&&{OR:[{reference:{contains:p.q,mode:'insensitive'}},{partyName:{contains:p.q,mode:'insensitive'}}]})};const [items,total]=await prisma.$transaction([prisma.creditBalance.findMany({where,include:creditDetail,orderBy:[{date:'desc'},{id:'desc'}],take:p.pageSize,skip:p.offset}),prisma.creditBalance.count({where})]);res.json({items:items.map(creditResult),total,page:p.page,totalPages:Math.max(1,Math.ceil(total/p.pageSize))});}catch(e){sendLedgerError(res,e,'Credits could not load.');}});
router.get('/:id',async(req,res)=>{try{res.json(creditResult(await findCredit(prisma,req.workspace.id,req.params.id)));}catch(e){sendLedgerError(res,e,'Credit could not load.');}});
router.post('/',async(req,res)=>{try{
 demand(req,req.body.source==='DEPOSIT'?'post':'correct');const result=await ledgerTransaction(tx=>once(tx,req,'create-credit',async()=>{
  const {kind,source,partyId,reference,accountId,counterAccountId,documentId}=req.body;
  if(!['AR','AP'].includes(kind)||!['CREDIT_NOTE','DEPOSIT','WRITE_OFF','OPENING_INCREASE','WITHHOLDING'].includes(source))throw new LedgerError('Choose a supported customer or supplier adjustment.');
  const ar=kind==='AR',date=ledgerDate(req.body.date),amount=decimalInput(req.body.amount,'Amount'),reason=reasonInput(req.body.reason),support=reasonInput(req.body.support,'Supporting reference');
  const taxAmount=decimalInput(req.body.taxAmount??0,'Tax reversal amount');
  if(taxAmount.gt(0)&&(source!=='CREDIT_NOTE'||taxAmount.gte(amount)))throw new LedgerError('A credit-note tax reversal must be less than the gross credit; use a reviewed tax code.');
  const purpose=source==='WITHHOLDING'?(ar?'WITHHOLDING_RECEIVABLE':'WITHHOLDING_PAYABLE'):(ar?'OUTPUT':'INPUT');
  const code=await taxCode(tx,req.workspace.id,req.body.taxCodeId,purpose,date);
  const taxAccount=source==='WITHHOLDING'||taxAmount.gt(0)?await taxPostingAccount(tx,req.workspace.id,code,purpose):null;
  if(source==='WITHHOLDING'&&(req.workspace.country!=='PH'||req.body.applyToDocument!==true||taxAccount!==counterAccountId||!['PENDING','RECEIVED'].includes(req.body.evidenceStatus)||req.body.evidenceStatus==='RECEIVED'&&!req.body.evidenceReference))throw new LedgerError('PH withholding needs the matching tax-code account, a document allocation and a certificate evidence status/reference.');
  if(amount.lte(0)||typeof reference!=='string'||!reference.trim()||reference.length>100)throw new LedgerError('Enter a positive amount and reference of at most 100 characters.');
  const party=partyId&&await tx[ar?'customer':'vendor'].findFirst({where:{id:partyId,workspaceId:req.workspace.id,isActive:true}});
  if(!party&&source!=='DEPOSIT')throw new LedgerError('Choose a customer or supplier from this workspace.');
  const accounts=await ledgerAccounts(tx,req.workspace.id,[accountId,counterAccountId]),account=accounts.get(accountId),counter=accounts.get(counterAccountId);
  if(accountId===counterAccountId)throw new LedgerError('Choose different posting accounts.');
  if(source==='DEPOSIT'){
   if(account.role!=='GENERAL'||account.type!==(ar?'LIABILITY':'ASSET')||!['CASH','BANK',...(!ar?['CREDIT_CARD']:[])].includes(counter.role))throw new LedgerError('Customer deposits need a general liability account; supplier prepayments need a general asset account. Select a cash, bank or supported card counter-account.');
  }else if(account.role!==(ar?'ACCOUNTS_RECEIVABLE':'ACCOUNTS_PAYABLE')||['CASH','BANK','ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE','CREDIT_CARD'].includes(counter.role))throw new LedgerError('Select the proper control account and an explicit non-cash adjustment account.');
  let original;
  if(source==='OPENING_INCREASE'||req.body.openingCorrection===true){assertPermission('manageBooks');original=await tx[ar?'invoice':'bill'].findFirst({where:{id:documentId,workspaceId:req.workspace.id,isOpeningBalance:true,[ar?'customerId':'vendorId']:party?.id},include:{postingEntry:true}});if(!original||date<original.postingEntry.date)throw new LedgerError('Select the original opening document and a later open correction date.');}
  const positive=source==='OPENING_INCREASE';
  const debitControl=ar===positive;
  const offset=amount.minus(taxAmount);
  const lines=source==='DEPOSIT'?(ar?[{accountId:counterAccountId,debit:amount},{accountId,credit:amount}]:[{accountId,debit:amount},{accountId:counterAccountId,credit:amount}]):debitControl?[{accountId,debit:amount},{accountId:counterAccountId,credit:offset}]:[{accountId:counterAccountId,debit:offset},{accountId,credit:amount}];
  if(taxAmount.gt(0))lines.push(ar?{accountId:taxAccount,debit:taxAmount}:{accountId:taxAccount,credit:taxAmount});
  const posting=await createPosting(tx,req.workspace.id,{date,description:source.replaceAll('_',' ')+' · '+reason,referenceNo:reference.trim(),lines});
  if(positive){const doc=await tx[ar?'invoice':'bill'].create({data:{workspaceId:req.workspace.id,[ar?'customerId':'vendorId']:party.id,[ar?'invoiceNo':'billNo']:reference.trim(),date,dueDate:date,status:ar?'SENT':'RECEIVED',total:amount,...(ar&&{subtotal:amount}),postingEntryId:posting.id,notes:'Opening adjustment for '+(original.invoiceNo??original.billNo)+': '+reason+'; support: '+support,lines:{create:{description:'Opening balance increase',quantity:1,unitPrice:amount,amount,accountId:counterAccountId}}}});await audit(tx,req.workspace.id,'OPENING_INCREASE_POSTED',doc.id,{originalId:original.id,amount,date,currency:req.workspace.currency,postingEntryId:posting.id,support},reason);return {documentId:doc.id,kind,openingAdjustment:true};}
  let credit=await tx.creditBalance.create({data:{workspaceId:req.workspace.id,kind,source,partyId:party?.id??null,partyName:party?.name??null,reference:reference.trim(),date,amount,accountId,postingEntryId:posting.id,reason,support,createdById:req.user.id},include:creditDetail});
  if(source==='WITHHOLDING'||taxAmount.gt(0))await recordTax(tx,req.workspace,code,{source:source==='WITHHOLDING'?'WITHHOLDING':'CREDIT_NOTE',sourceId:credit.id,postingEntryId:posting.id,date,baseAmount:source==='WITHHOLDING'?decimalInput(req.body.taxBaseAmount,'Withholding certificate tax base'):offset,amount:source==='WITHHOLDING'?amount:taxAmount.negated(),evidenceStatus:source==='WITHHOLDING'?req.body.evidenceStatus:'NOT_REQUIRED',evidenceReference:source==='WITHHOLDING'?req.body.evidenceReference:undefined});
  await audit(tx,req.workspace.id,'CREDIT_CREATED',credit.id,{kind,source,partyId:party?.id,amount,date,currency:req.workspace.currency,support,originalId:original?.id},reason);
  if(req.body.applyToDocument===true){if(!documentId)throw new LedgerError('Select the document to adjust.');return allocateCredit(tx,req.workspace,credit,[{documentId,amount:amount.toFixed(2)}],date,req.user.id);}
  return creditResult(credit);
 }));res.status(201).json(result);
}catch(e){if(e.code==='P2002')return res.status(409).json({error:'This adjustment reference already exists.'});sendLedgerError(res,e,'Credit could not save.');}});
router.post('/:id/allocate',async(req,res)=>{try{demand(req,'post');res.json(await ledgerTransaction(tx=>once(tx,req,'allocate:'+req.params.id,async()=>allocateCredit(tx,req.workspace,await findCredit(tx,req.workspace.id,req.params.id),req.body.allocations,ledgerDate(req.body.date),req.user.id))));}catch(e){sendLedgerError(res,e,'Allocation could not save.');}});
router.post('/:id/assign',async(req,res)=>{try{demand(req,'correct');res.json(await ledgerTransaction(tx=>once(tx,req,'assign:'+req.params.id,async()=>{const c=await findCredit(tx,req.workspace.id,req.params.id);if(c.partyId||c.reversalEntryId)throw new LedgerError('Only unassigned active deposits can be assigned.',409);const party=await tx[c.kind==='AR'?'customer':'vendor'].findFirst({where:{id:req.body.partyId,workspaceId:req.workspace.id,isActive:true}});if(!party)throw new LedgerError('Choose a customer or supplier.');await tx.creditBalance.update({where:{id:c.id},data:{partyId:party.id,partyName:party.name}});await audit(tx,req.workspace.id,'DEPOSIT_ASSIGNED',c.id,{partyId:party.id,partyName:party.name});return creditResult(await findCredit(tx,req.workspace.id,c.id));})));}catch(e){sendLedgerError(res,e,'Assignment could not save.');}});
router.post('/:id/refund',async(req,res)=>{try{demand(req,'correct');res.json(await ledgerTransaction(tx=>once(tx,req,'refund:'+req.params.id,async()=>{const c=await findCredit(tx,req.workspace.id,req.params.id),date=ledgerDate(req.body.date),reason=reasonInput(req.body.reason),amount=decimalInput(req.body.amount,'Refund');if(date<c.date||amount.lte(0)||amount.gt(remainingCredit(c)))throw new LedgerError('Refund must be positive, within the available balance and dated on or after the source.');const accounts=await ledgerAccounts(tx,req.workspace.id,[req.body.paymentAccountId]),bank=accounts.get(req.body.paymentAccountId);if(!['CASH','BANK'].includes(bank.role))throw new LedgerError('Select a cash or bank account.');const ar=c.kind==='AR';const entry=await createPosting(tx,req.workspace.id,{date,description:'Refund '+c.reference+' · '+reason,lines:ar?[{accountId:c.accountId,debit:amount},{accountId:bank.id,credit:amount}]:[{accountId:bank.id,debit:amount},{accountId:c.accountId,credit:amount}]});await tx.creditRefund.create({data:{creditId:c.id,date,amount,postingEntryId:entry.id,reason}});await audit(tx,req.workspace.id,'CREDIT_REFUNDED',c.id,{amount,date,currency:req.workspace.currency,postingEntryId:entry.id},reason);return creditResult(await findCredit(tx,req.workspace.id,c.id));})));}catch(e){sendLedgerError(res,e,'Refund could not save.');}});
router.post('/:id/reverse/:type/:actionId',async(req,res)=>{try{demand(req,'correct');res.json(await ledgerTransaction(tx=>once(tx,req,'reverse:'+req.params.id+':'+req.params.type+':'+req.params.actionId,async()=>{
 const c=await findCredit(tx,req.workspace.id,req.params.id),date=ledgerDate(req.body.date),reason=reasonInput(req.body.reason),type=req.params.type;
 if(!['credit','allocation','refund'].includes(type))throw new LedgerError('Choose a correction source.');
 const source=type==='credit'?c:(type==='allocation'?c.allocations:c.refunds).find(a=>a.id===req.params.actionId);
 if(!source||type==='credit'&&req.params.actionId!==c.id)throw new LedgerError('Source action not found.',404);
 if(source.reversalEntryId||source.reversedDate)throw new LedgerError('This action already has a correction.',409);
 if(date<source.date)throw new LedgerError('Correction date cannot precede the source.');
 if(type==='credit'&&!remainingCredit(c).eq(c.amount))throw new LedgerError('Reverse allocations and refunds before reversing the source credit.',409);
 if(type==='credit'&&[...c.allocations,...c.refunds].some(a=>(a.reversedDate??a.date)>date))throw new LedgerError('The source correction cannot precede its allocation/refund history.');
 let reversal;
 if(source.postingEntryId){const entry=await tx.journalEntry.findFirst({where:{id:source.postingEntryId,workspaceId:req.workspace.id},include:{journalLines:true}});await checkCorrectionMatch(tx,req.workspace.id,entry,date);reversal=await reversePosting(tx,req.workspace.id,entry,date,'Credit correction: '+reason);}
 else await (await import('../lib/ledger.js')).checkBankPostingDate(tx,req.workspace.id,date,await ledgerAccounts(tx,req.workspace.id,[c.accountId]));
 await tx[type==='credit'?'creditBalance':type==='allocation'?'creditAllocation':'creditRefund'].update({where:{id:source.id},data:{reversalEntryId:reversal?.id,...(type!=='credit'&&{reversedDate:date,reason})}});
 if(type==='allocation')await refreshSettledDocument(tx,c.kind,source.invoiceId??source.billId);
 await audit(tx,req.workspace.id,'CREDIT_ACTION_REVERSED',c.id,{type,sourceId:source.id,date,reversalEntryId:reversal?.id},reason);return creditResult(await findCredit(tx,req.workspace.id,c.id));
})));}catch(e){sendLedgerError(res,e,'Correction could not save.');}});
export default router;
