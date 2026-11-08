import { Prisma } from '@prisma/client';
import { Decimal, LedgerError, ledgerDate, nextDay } from './ledger.js';
import { pageOptions } from './workbenchQueries.js';

export async function agingReport(tx, workspace, query) {
  const kind = query.kind ?? 'receivables';
  const basis = query.agingBy ?? 'dueDate';
  if (!['receivables', 'payables'].includes(kind) || !['dueDate', 'invoiceDate'].includes(basis)) throw new LedgerError('Choose receivables or payables, and a valid aging date basis.');
  const asOf = ledgerDate(query.asOf ?? new Date().toISOString(), 'Aging date').toISOString().slice(0, 10);
  const cutoff = nextDay(asOf).toISOString();
  const options = pageOptions(query);
  const invoice = kind === 'receivables';
  const table = Prisma.raw(invoice ? '"Invoice"' : '"Bill"');
  const paymentKey = Prisma.raw(invoice ? '"invoiceId"' : '"billId"');
  const contactTable = Prisma.raw(invoice ? '"Customer"' : '"Vendor"');
  const contactKey = Prisma.raw(invoice ? '"customerId"' : '"vendorId"');
  const reference = Prisma.raw(invoice ? '"invoiceNo"' : '"billNo"');
  const role = invoice ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE';
  const agingDate = Prisma.raw(basis === 'dueDate' ? '"dueDate"' : 'date');
  const sign = invoice ? 1 : -1;
  const [report] = await tx.$queryRaw`
    WITH payment_totals AS (
      SELECT p.${paymentKey} AS document_id,
        SUM(p."amount") AS paid
      FROM "SettlementApplication" p JOIN ${table} d ON d."id" = p.${paymentKey}
      WHERE d."workspaceId" = ${workspace.id} AND p."date" < ${cutoff}::timestamp
        AND (p."reversedDate" IS NULL OR p."reversedDate" >= ${cutoff}::timestamp) GROUP BY p.${paymentKey}
    ), documents AS (
      SELECT d."id", d.${reference} AS reference, c."id" AS "partyId", c."name" AS "partyName",
        d."date", d."dueDate", d."total", COALESCE(p.paid, 0) AS paid,
        (CASE WHEN v."id" IS NOT NULL THEN 0 ELSE d."total" END - COALESCE(p.paid, 0)) AS remaining,
        control."accountId", d."isOpeningBalance", 'DOCUMENT'::text AS "recordType"
      FROM ${table} d JOIN ${contactTable} c ON c."id" = d.${contactKey} AND c."workspaceId" = ${workspace.id}
      JOIN "JournalEntry" j ON j."id" = d."postingEntryId" AND j."workspaceId" = ${workspace.id} AND j."status" = 'POSTED' AND j."date" < ${cutoff}::timestamp
      LEFT JOIN "JournalEntry" v ON v."reversalOfId" = j."id" AND v."workspaceId" = ${workspace.id} AND v."status" = 'POSTED' AND v."date" < ${cutoff}::timestamp
      LEFT JOIN payment_totals p ON p.document_id = d."id"
      LEFT JOIN LATERAL (
        SELECT l."accountId" FROM "JournalLine" l JOIN "Account" a ON a."id" = l."accountId"
        WHERE l."journalEntryId" = j."id" AND a."workspaceId" = ${workspace.id} AND a."role"::text = ${role}
        ORDER BY l."id" LIMIT 1
      ) control ON true
      WHERE d."workspaceId" = ${workspace.id}
      UNION ALL
      SELECT c.id,c.reference,c."partyId",c."partyName",c.date,c.date,c.amount,0,
        CASE WHEN r.id IS NOT NULL THEN 0 ELSE -c.amount
          + COALESCE((SELECT sum(a.amount) FROM "CreditAllocation" a WHERE a."creditId"=c.id AND a.date < ${cutoff}::timestamp AND (a."reversedDate" IS NULL OR a."reversedDate">= ${cutoff}::timestamp)),0)
          + COALESCE((SELECT sum(f.amount) FROM "CreditRefund" f WHERE f."creditId"=c.id AND f.date < ${cutoff}::timestamp AND (f."reversedDate" IS NULL OR f."reversedDate">= ${cutoff}::timestamp)),0) END,
        c."accountId",false,'CREDIT'
      FROM "CreditBalance" c JOIN "JournalEntry" j ON j.id=c."postingEntryId" AND j.status='POSTED' AND j.date < ${cutoff}::timestamp
      LEFT JOIN "JournalEntry" r ON r.id=c."reversalEntryId" AND r.status='POSTED' AND r.date < ${cutoff}::timestamp
      WHERE c."workspaceId"=${workspace.id} AND c.kind=${invoice?'AR':'AP'} AND c.source <> 'DEPOSIT'
    ), aged AS (
      SELECT *, (${asOf}::date - ${agingDate}::date)::integer AS age,
        CASE WHEN remaining < 0 THEN 'credit' WHEN ${asOf}::date - ${agingDate}::date <= 0 THEN 'current'
          WHEN ${asOf}::date - ${agingDate}::date <= 30 THEN 'days1to30'
          WHEN ${asOf}::date - ${agingDate}::date <= 60 THEN 'days31to60'
          WHEN ${asOf}::date - ${agingDate}::date <= 90 THEN 'days61to90' ELSE 'days91plus' END AS bucket
      FROM documents WHERE remaining <> 0
    ), controls AS (
      SELECT a."id", a."code", a."name",
        COALESCE((SELECT SUM(l."debit" - l."credit") * ${sign} FROM "JournalLine" l JOIN "JournalEntry" j ON j."id" = l."journalEntryId"
          WHERE l."accountId" = a."id" AND j."workspaceId" = ${workspace.id} AND j."status" = 'POSTED' AND j."date" < ${cutoff}::timestamp), 0) AS ledger,
        COALESCE((SELECT SUM(remaining) FROM aged WHERE "accountId" = a."id"), 0) AS subledger
      FROM "Account" a WHERE a."workspaceId" = ${workspace.id} AND a."role"::text = ${role}
    )
    SELECT
      (SELECT COUNT(*)::integer FROM aged) AS total,
      COALESCE((SELECT SUM(remaining) FROM aged), 0)::text AS net,
      COALESCE((SELECT SUM(remaining) FROM aged WHERE remaining > 0), 0)::text AS debits,
      COALESCE((SELECT SUM(-remaining) FROM aged WHERE remaining < 0), 0)::text AS credits,
      COALESCE((SELECT jsonb_object_agg(bucket, amount::text) FROM (SELECT bucket, SUM(remaining) AS amount FROM aged GROUP BY bucket) b), '{}'::jsonb) AS buckets,
      COALESCE((SELECT jsonb_agg(party ORDER BY "partyName", "partyId") FROM (
        SELECT "partyId", "partyName", SUM(remaining)::text AS balance,
          SUM(CASE WHEN remaining > 0 THEN remaining ELSE 0 END)::text AS debits,
          SUM(CASE WHEN remaining < 0 THEN -remaining ELSE 0 END)::text AS credits,
          jsonb_build_object(
            'current', SUM(CASE WHEN bucket = 'current' THEN remaining ELSE 0 END)::text,
            'days1to30', SUM(CASE WHEN bucket = 'days1to30' THEN remaining ELSE 0 END)::text,
            'days31to60', SUM(CASE WHEN bucket = 'days31to60' THEN remaining ELSE 0 END)::text,
            'days61to90', SUM(CASE WHEN bucket = 'days61to90' THEN remaining ELSE 0 END)::text,
            'days91plus', SUM(CASE WHEN bucket = 'days91plus' THEN remaining ELSE 0 END)::text
          ) AS buckets, COUNT(*)::integer AS documents
        FROM aged GROUP BY "partyId", "partyName"
      ) party), '[]'::jsonb) AS parties,
      COALESCE((SELECT jsonb_agg(item ORDER BY "dueDate", "id") FROM (
        SELECT "id", reference, "partyId", "partyName", "date"::date::text AS "date", "dueDate"::date::text AS "dueDate",
          "total"::text AS "originalAmount", paid::text AS "paidAsOf", remaining::text AS balance, age, bucket, "accountId", "isOpeningBalance", "recordType"
        FROM aged ORDER BY "dueDate", "id" LIMIT ${options.pageSize} OFFSET ${options.offset}
      ) item), '[]'::jsonb) AS items,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('accountId', "id", 'code', "code", 'name', "name", 'ledgerBalance', ledger::text,
        'subledgerBalance', subledger::text, 'difference', (ledger - subledger)::text) ORDER BY "code") FROM controls), '[]'::jsonb) AS controls,
      (SELECT COUNT(*)::integer FROM documents WHERE "accountId" IS NULL) AS "unmappedDocuments",
      (SELECT COUNT(*)::integer FROM ${table} WHERE "workspaceId" = ${workspace.id} AND "postingEntryId" IS NULL AND "status"::text IN ('SENT', 'RECEIVED', 'PAID') AND "date" < ${cutoff}::timestamp) AS "unverifiedDocuments"
  `;
  const money = value => new Decimal(value).toFixed(2);
  const controls = report.controls.map(row => ({ ...row, ledgerBalance: money(row.ledgerBalance), subledgerBalance: money(row.subledgerBalance), difference: money(row.difference) }));
  const ledger = controls.reduce((sum, row) => sum.plus(row.ledgerBalance), new Decimal(0));
  return { kind, asOf, agingBy: basis, currency: workspace.currency, basis: 'Accrual',
    page: options.page, pageSize: options.pageSize, total: report.total, totalPages: Math.max(1, Math.ceil(report.total / options.pageSize)),
    items: report.items.map(row => ({ ...row, originalAmount: money(row.originalAmount), paidAsOf: money(row.paidAsOf), balance: money(row.balance) })),
    parties: report.parties.map(row => ({ ...row, balance: money(row.balance), debits: money(row.debits), credits: money(row.credits),
      buckets: Object.fromEntries(Object.entries(row.buckets).map(([key, value]) => [key, money(value)])) })),
    totals: { net: money(report.net), debits: money(report.debits), credits: money(report.credits) },
    buckets: Object.fromEntries(['current', 'days1to30', 'days31to60', 'days61to90', 'days91plus', 'credit'].map(key => [key, money(report.buckets[key] ?? 0)])),
    reconciliation: { controls, ledgerBalance: money(ledger), subledgerBalance: money(report.net), difference: money(ledger.minus(report.net)),
      unmappedDocuments: report.unmappedDocuments, unverifiedDocuments: report.unverifiedDocuments,
      balanced: controls.length > 0 && controls.every(row => row.difference === '0.00') && ledger.eq(report.net) && !report.unmappedDocuments && !report.unverifiedDocuments },
  };
}
