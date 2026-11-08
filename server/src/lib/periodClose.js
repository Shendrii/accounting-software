import { Prisma } from '@prisma/client';
import { LedgerError, Decimal, decimalSum, ledgerDate, nextDay } from './ledger.js';
import { agingReport } from './aging.js';
import {scheduleCloseGate} from './accountingSchedules.js';

export async function periodState(tx, workspace, period) {
  if (period.status === 'CLOSED') return { ...period, ...period.proof, canClose: false, savedProof: true };
  const cutoff = nextDay(period.endDate.toISOString());
  const [population, drafts, invoices, bills, receipts, reconciliations, ar, ap] = await Promise.all([
    tx.$queryRaw`
      WITH activity AS (
        SELECT l."accountId", SUM(l."debit" - l."credit") AS net,
          COUNT(*) FILTER (WHERE j."date" >= ${period.startDate}) AS movement,
          md5(string_agg(l."id" || ':' || l."debit"::text || ':' || l."credit"::text || ':' || j."date"::text, ',' ORDER BY l."id")) AS fingerprint
        FROM "JournalLine" l JOIN "JournalEntry" j ON j."id" = l."journalEntryId"
        WHERE j."workspaceId" = ${workspace.id} AND j."status" = 'POSTED' AND j."date" < ${cutoff}
        GROUP BY l."accountId"
      )
      SELECT a."id", a."code", a."name", a."role", COALESCE(x.net,0)::text AS balance, COALESCE(x.fingerprint,'empty') AS fingerprint
      FROM "Account" a LEFT JOIN activity x ON x."accountId" = a."id"
      WHERE a."workspaceId" = ${workspace.id} AND (COALESCE(x.net,0) <> 0 OR COALESCE(x.movement,0) > 0 OR a."isActive" AND a."role"::text IN ('BANK','CREDIT_CARD'))
      ORDER BY a."code"`,
    tx.journalEntry.count({ where: { workspaceId: workspace.id, status: 'DRAFT', date: { lt: cutoff } } }),
    tx.invoice.count({ where: { workspaceId: workspace.id, status: 'DRAFT', date: { lt: cutoff } } }),
    tx.bill.count({ where: { workspaceId: workspace.id, status: 'DRAFT', date: { lt: cutoff } } }),
    tx.receipt.findMany({ where: { workspaceId: workspace.id, status: 'PENDING' }, select: { extractedData: true,postingDate:true } }),
    tx.reconciliation.findMany({ where: { workspaceId: workspace.id, status: 'COMPLETE', statementDate: period.endDate, proof: { not: Prisma.DbNull } }, select: { id: true, accountId: true } }),
    agingReport(tx, workspace, { asOf: period.endDate.toISOString().slice(0, 10), kind: 'receivables', pageSize: '1' }),
    agingReport(tx, workspace, { asOf: period.endDate.toISOString().slice(0, 10), kind: 'payables', pageSize: '1' }),
  ]);
  const reviews = await tx.periodAccountReview.findMany({ where: { periodId: period.id } });
  const accounts = population.map(account => {
    const review = reviews.find(row => row.accountId === account.id);
    const bankProof = reconciliations.find(row => row.accountId === account.id)?.id ?? null;
    const fingerprint = account.fingerprint + ':' + account.role + ':' + (bankProof || 'unchecked');
    const stale = Boolean(review && review.fingerprint !== fingerprint);
    return { ...account, balance: new Decimal(account.balance).toFixed(2), fingerprint, bankProof, review,
      status: !review || stale ? 'OPEN' : review.status, stale };
  });
  const pendingReceipts = receipts.filter(row => {
    try { return (row.postingDate??ledgerDate(row.extractedData?.invoiceDate || row.extractedData?.date)) < cutoff; } catch { return true; }
  }).length;
  const agrees = report => report.reconciliation.difference === '0.00' && report.reconciliation.controls.every(row => row.difference === '0.00') && !report.reconciliation.unmappedDocuments && !report.reconciliation.unverifiedDocuments;
  const totals = { debit: decimalSum(accounts.filter(row => new Decimal(row.balance).gt(0)).map(row => row.balance)).toFixed(2),
    credit: decimalSum(accounts.filter(row => new Decimal(row.balance).lt(0)).map(row => new Decimal(row.balance).abs())).toFixed(2) };
  const schedules=await scheduleCloseGate(tx,workspace.id,period.startDate,period.endDate);
  const taxEvidence=await tx.$queryRaw`SELECT t.id,COALESCE(t."codeSnapshot"->>'accountId',c."accountId") AS "accountId",t."evidenceReference" FROM "TaxRecord" t LEFT JOIN "TaxCode" c ON c.id=t."codeId" JOIN "JournalEntry" j ON j.id=t."postingEntryId" AND j.status='POSTED' LEFT JOIN "JournalEntry" r ON r."reversalOfId"=j.id AND r.status='POSTED' AND r.date<${cutoff} WHERE t."workspaceId"=${workspace.id} AND t."evidenceStatus"='PENDING' AND t.date<${cutoff} AND r.id IS NULL`;
  const pendingTaxEvidence=taxEvidence.filter(t=>!accounts.some(a=>a.id===t.accountId&&a.status==='WAIVED'));
  const gates = { schedulesMissing:schedules.missing.length,taxEvidencePending:pendingTaxEvidence.length,trialBalance: totals.debit === totals.credit, receivables: agrees(ar), payables: agrees(ap),
    drafts, draftInvoices: invoices, draftBills: bills, pendingReceipts,
    accountsReviewed: accounts.length > 0 && accounts.every(row => ['RECONCILED', 'WAIVED'].includes(row.status)),
    bankEvidence: accounts.every(row => !['BANK', 'CREDIT_CARD'].includes(row.role) || row.status === 'WAIVED' || Boolean(row.bankProof)),
    separateReview: !workspace.separateCloseReviewer || accounts.every(row => row.status === 'WAIVED' || row.review?.ownerId !== row.review?.reviewedById),
  };
  const earlierOpen = await tx.accountingPeriod.count({ where: { workspaceId: workspace.id, status: 'OPEN', endDate: { lt: period.startDate } } });
  const canClose = Boolean(workspace.setupCompletedAt && gates.trialBalance && gates.receivables && gates.payables &&
    !schedules.missing.length && !pendingTaxEvidence.length && !drafts && !invoices && !bills && !pendingReceipts && !earlierOpen && gates.accountsReviewed && gates.bankEvidence && gates.separateReview);
  return { ...period, accounts, totals, gates, earlierOpen, canClose,requiredScheduleReviews:schedules.missing,pendingTaxEvidence, currency: workspace.currency,
    ar: ar.reconciliation, ap: ap.reconciliation, completed: accounts.filter(row => ['RECONCILED', 'WAIVED'].includes(row.status)).length };
}

export function closeDates(input) {
  const startDate = ledgerDate(input.startDate, 'Period starting date'); const endDate = ledgerDate(input.endDate, 'Period ending date');
  const targetDate = ledgerDate(input.targetDate, 'Close target date');
  if (startDate > endDate || targetDate < endDate) throw new LedgerError('The end must follow the start, and the close target cannot precede the period end.');
  return { startDate, endDate, targetDate };
}
