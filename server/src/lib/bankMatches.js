import {Decimal,LedgerError,decimalInput,decimalSum,ledgerDate,createPosting,ledgerAccounts} from './ledger.js';
import {audit} from './audit.js';
export async function groupMatch(tx,req,reviewable){
 const {bankTransactionIds,journalLineIds,fee}=req.body;
 for(const ids of [bankTransactionIds,journalLineIds])if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new LedgerError('Select one to 100 distinct statement rows and posted ledger lines.');
 const rows=[];for(const id of bankTransactionIds)rows.push(await reviewable(tx,req.workspace.id,id));
 const accountId=rows[0].accountId;if(rows.some(r=>r.accountId!==accountId||r.isMatched))throw new LedgerError('Select unmatched rows from the same account.',409);
 const lines=await tx.journalLine.findMany({where:{id:{in:journalLineIds},accountId,journalEntry:{workspaceId:req.workspace.id,status:'POSTED'}},include:{journalEntry:true}});
 if(lines.length!==journalLineIds.length)throw new LedgerError('Choose posted lines from this bank or card account.');
 if(await tx.bankMatchLine.findFirst({where:{journalLineId:{in:journalLineIds}}})||await tx.bankTransaction.findFirst({where:{workspaceId:req.workspace.id,matchedLineId:{in:journalLineIds}}}))throw new LedgerError('A selected ledger line is already matched.',409);
 const bankTotal=decimalSum(rows.map(r=>r.amount)),bookTotal=decimalSum(lines.map(l=>new Decimal(l.debit).minus(l.credit)));
 if(fee){const amount=decimalInput(fee.amount,'Settlement fee');if(amount.lte(0)||!bookTotal.minus(amount).eq(bankTotal))throw new LedgerError('The explicit fee must equal the difference between gross postings and the net statement amount.');const accounts=await ledgerAccounts(tx,req.workspace.id,[fee.expenseAccountId]);if(accounts.get(fee.expenseAccountId).type!=='EXPENSE')throw new LedgerError('Select a fee expense account.');const date=ledgerDate(fee.date);const min=rows.reduce((d,r)=>r.date<d?r.date:d,rows[0].date),max=rows.reduce((d,r)=>r.date>d?r.date:d,rows[0].date);if(date<min||date>max)throw new LedgerError('Date the settlement fee within the selected statement rows.');const posting=await createPosting(tx,req.workspace.id,{date,description:'Net settlement fee',referenceNo:'bank-fee:settlement',lines:[{accountId:fee.expenseAccountId,debit:amount},{accountId,credit:amount}]});lines.push(posting.journalLines.find(l=>l.accountId===accountId));}
 else if(!bankTotal.eq(bookTotal))throw new LedgerError('Selected statement rows and ledger lines must have the same signed total. Record a supported fee explicitly or review the missing posting.');
 const group=await tx.bankMatchGroup.create({data:{workspaceId:req.workspace.id,accountId,reason:typeof req.body.reason==='string'?req.body.reason.slice(0,1000):'Reviewed grouped bank match',createdById:req.user.id,rows:{create:rows.map(r=>({bankTransactionId:r.id}))},lines:{create:lines.map(l=>({journalLineId:l.id}))}}});
 await tx.bankTransaction.updateMany({where:{workspaceId:req.workspace.id,id:{in:bankTransactionIds}},data:{isMatched:true,matchedLineId:null}});
 await audit(tx,req.workspace.id,'BANK_GROUP_MATCHED',group.id,{accountId,bankTransactionIds,journalLineIds:lines.map(l=>l.id),bankTotal,bookTotal,currency:req.workspace.currency,fee:fee??null});return {success:true,groupId:group.id};
}
