import {Decimal,LedgerError,ledgerDate,nextDay,decimalSum,ledgerBalances,cashLedgerAccounts} from './ledger.js';
export const reportingGroups={ASSET:['CURRENT_ASSET','NONCURRENT_ASSET','CONTRA_ASSET'],LIABILITY:['CURRENT_LIABILITY','NONCURRENT_LIABILITY'],EQUITY:['EQUITY'],REVENUE:['OPERATING_REVENUE','OTHER_REVENUE'],EXPENSE:['COST_OF_SALES','OPERATING_EXPENSE','OTHER_EXPENSE','INCOME_TAX']};
export const cashCategories=['OPERATING','INVESTING','FINANCING'];
export function range(query){const start=ledgerDate(query.startDate),end=ledgerDate(query.endDate);if(start>end)throw new LedgerError('The end date cannot precede the start.');return {start,end,until:nextDay(end.toISOString())};}
export async function cashFlow(tx,workspace,query){
 const {start,end,until}=range(query);
 const rows=await tx.$queryRaw`SELECT j.id,j.date,j.description,j."referenceNo",
 COALESCE(sum(CASE WHEN a.role::text IN ('CASH','BANK') THEN l.debit-l.credit ELSE 0 END),0)::text AS cash,
 count(*) FILTER(WHERE a.role::text IN ('CASH','BANK'))::integer AS "cashLines",
 count(*) FILTER(WHERE a.role::text NOT IN ('CASH','BANK') AND a."cashFlowCategory" IS NULL)::integer AS unmapped,
 array_remove(array_agg(DISTINCT CASE WHEN a.role::text NOT IN ('CASH','BANK') THEN a."cashFlowCategory" END),NULL) AS categories,
 sum(l.debit)::text AS "grossDebits"
 FROM "JournalEntry" j JOIN "JournalLine" l ON l."journalEntryId"=j.id JOIN "Account" a ON a.id=l."accountId" AND a."workspaceId"=${workspace.id}
 WHERE j."workspaceId"=${workspace.id} AND j.status='POSTED' AND j.date>=${start.toISOString()}::timestamp AND j.date<${until.toISOString()}::timestamp GROUP BY j.id ORDER BY j.date,j.id LIMIT 10001`;
 if(rows.length>10000)throw new LedgerError('This workpaper covers more than 10,000 postings. Narrow the reporting dates.',409);
 const reviews=await tx.cashFlowReview.findMany({where:{workspaceId:workspace.id,journalEntryId:{in:rows.map(r=>r.id)}}});const byId=new Map(reviews.map(r=>[r.journalEntryId,r]));
 const totals=Object.fromEntries([...cashCategories,'UNCLASSIFIED'].map(c=>[c,new Decimal(0)]));const activity=[],noncash=[];
 for(const row of rows){const amount=new Decimal(row.cash);if(amount.isZero()){if(!row.cashLines&&row.categories.some(c=>['INVESTING','FINANCING'].includes(c)))noncash.push({...row,amount:row.grossDebits});continue;}
  const review=byId.get(row.id),automatic=!row.unmapped&&row.categories.length===1?row.categories[0]:null;const allocations=review?.allocations??[{category:automatic??'UNCLASSIFIED',amount:amount.toFixed(2)}];
  if(!decimalSum(allocations.map(a=>a.amount)).eq(amount))throw new LedgerError('Saved cash-flow allocations no longer agree with their source posting.',409);
  for(const a of allocations)totals[a.category]=totals[a.category].plus(a.amount);
  activity.push({...row,amount:amount.toFixed(2),allocations,reviewed:Boolean(review),reason:review?.reason??null});
 }
 const [openingAccounts,endingAccounts]=await Promise.all([cashLedgerAccounts(tx,workspace.id,ledgerBalances(tx,workspace.id,{lt:start})),cashLedgerAccounts(tx,workspace.id,ledgerBalances(tx,workspace.id,{lt:until}))]);
 const opening=decimalSum(openingAccounts.map(a=>a.balance)),ending=decimalSum(endingAccounts.map(a=>a.balance)),movement=decimalSum(activity.map(a=>a.amount));
 return {startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),currency:workspace.currency,basis:'Direct cash movements from posted Cash and Bank accounts; internal cash transfers excluded.',opening:opening.toFixed(2),ending:ending.toFixed(2),movement:movement.toFixed(2),difference:opening.plus(movement).minus(ending).toFixed(2),totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v.toFixed(2)])),unclassified:activity.filter(r=>r.allocations.some(a=>a.category==='UNCLASSIFIED')).length,activity,noncash};
}
export async function comparative(tx,workspace,query){const kind=query.report??'profit-loss';if(!['profit-loss','balance-sheet'].includes(kind))throw new LedgerError('Choose profit and loss or balance sheet.');const current=range(query),prior=range({startDate:query.comparisonStart,endDate:query.comparisonEnd});
 const rows=await tx.$queryRaw`SELECT a.id,a.code,a.name,a.type,a."reportingGroup",
 COALESCE(sum(CASE WHEN j.date<${current.until.toISOString()}::timestamp AND (${kind}='balance-sheet' OR j.date>=${current.start.toISOString()}::timestamp) THEN l.debit-l.credit ELSE 0 END),0)::text AS current,
 COALESCE(sum(CASE WHEN j.date<${prior.until.toISOString()}::timestamp AND (${kind}='balance-sheet' OR j.date>=${prior.start.toISOString()}::timestamp) THEN l.debit-l.credit ELSE 0 END),0)::text AS prior
 FROM "Account" a LEFT JOIN "JournalLine" l ON l."accountId"=a.id LEFT JOIN "JournalEntry" j ON j.id=l."journalEntryId" AND j."workspaceId"=${workspace.id} AND j.status='POSTED'
 WHERE a."workspaceId"=${workspace.id} GROUP BY a.id ORDER BY a.code`;
 const formatted=rows.map(r=>{const sign=['LIABILITY','EQUITY','REVENUE'].includes(r.type)?-1:1;const current=new Decimal(r.current).times(sign),prior=new Decimal(r.prior).times(sign),change=current.minus(prior);return {...r,current:current.toFixed(2),prior:prior.toFixed(2),change:change.toFixed(2),percent:prior.isZero()?null:change.div(prior.abs()).times(100).toFixed(2)};});
 const totals=(field)=>({revenue:decimalSum(formatted.filter(r=>r.type==='REVENUE').map(r=>r[field])),expense:decimalSum(formatted.filter(r=>r.type==='EXPENSE').map(r=>r[field]))});const c=totals('current'),p=totals('prior');
 if(kind==='balance-sheet'){const current=c.revenue.minus(c.expense),prior=p.revenue.minus(p.expense);formatted.push({id:'unclosed-earnings',code:'',name:'Unclosed earnings',type:'EQUITY',reportingGroup:'EQUITY',current:current.toFixed(2),prior:prior.toFixed(2),change:current.minus(prior).toFixed(2),percent:prior.isZero()?null:current.minus(prior).div(prior.abs()).times(100).toFixed(2)});}
 const items=formatted.filter(r=>(kind==='profit-loss'?['REVENUE','EXPENSE']:['ASSET','LIABILITY','EQUITY']).includes(r.type)&&(!new Decimal(r.current).isZero()||!new Decimal(r.prior).isZero()));
 return {report:kind,currency:workspace.currency,items,unmapped:items.filter(r=>!r.reportingGroup).length,currentNetIncome:c.revenue.minus(c.expense).toFixed(2),priorNetIncome:p.revenue.minus(p.expense).toFixed(2)};
}
