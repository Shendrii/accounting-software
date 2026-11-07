import { Decimal, ledgerDate, nextDay } from './ledger.js';

export function summaryDay(value) {
  return ledgerDate(value ?? new Date().toISOString(), 'Summary date');
}

export async function salesSummary(client, workspaceId, day) {
  // Prisma dates bind as timestamptz; these ledger columns store calendar dates in timestamp.
  const today = day.toISOString().slice(0, 10);
  const [summary] = await client.$queryRaw`
    WITH payments AS (
      SELECT p."invoiceId", SUM(p."amount") AS paid
      FROM "InvoicePayment" p
      JOIN "Invoice" i ON i."id" = p."invoiceId"
      WHERE i."workspaceId" = ${workspaceId} AND p."reversalEntryId" IS NULL
      GROUP BY p."invoiceId"
    ), documents AS (
      SELECT i."id", i."customerId", i."invoiceNo", i."status", i."postingEntryId", i."date", i."dueDate", i."total", CASE WHEN i."status" = 'PAID' AND i."postingEntryId" IS NULL
        THEN i."total" ELSE COALESCE(p.paid, 0) END AS paid
      FROM "Invoice" i LEFT JOIN payments p ON p."invoiceId" = i."id"
      WHERE i."workspaceId" = ${workspaceId}
    ), balances AS (
      SELECT d.*, CASE WHEN d."status" = 'VOID' THEN 0 ELSE d."total" - d.paid END AS remaining,
        (d."status" = 'SENT' AND d."postingEntryId" IS NOT NULL AND d."total" > d.paid) AS open
      FROM documents d
    )
    SELECT
      COUNT(*) FILTER (WHERE open)::integer AS "openCount",
      COALESCE(SUM(remaining) FILTER (WHERE open), 0)::text AS "openBalance",
      COUNT(*) FILTER (WHERE open AND "dueDate" < ${today}::timestamp)::integer AS "overdueCount",
      COALESCE(SUM(remaining) FILTER (WHERE open AND "dueDate" < ${today}::timestamp), 0)::text AS "overdueBalance",
      COUNT(*) FILTER (WHERE "status" = 'DRAFT')::integer AS "draftCount",
      COALESCE((
        SELECT jsonb_agg(recent ORDER BY recent."date" DESC, recent."id" DESC)
        FROM (
          SELECT b."id", b."invoiceNo", b."status", b."postingEntryId",
            b."date" AT TIME ZONE 'UTC' AS "date", b."dueDate" AT TIME ZONE 'UTC' AS "dueDate",
            b."total"::text AS "total", b.paid::text AS "amountPaid", b.remaining::text AS "balanceDue",
            jsonb_build_object('id', c."id", 'name', c."name") AS customer
          FROM balances b JOIN "Customer" c ON c."id" = b."customerId" AND c."workspaceId" = ${workspaceId}
          ORDER BY b."date" DESC, b."id" DESC LIMIT 6
        ) recent
      ), '[]'::jsonb) AS recent
    FROM balances
  `;
  return {
    ...summary,
    openBalance: new Decimal(summary.openBalance).toFixed(2),
    overdueBalance: new Decimal(summary.overdueBalance).toFixed(2),
    recent: summary.recent.map(row => ({ ...row, amountPaid: new Decimal(row.amountPaid).toFixed(2), balanceDue: new Decimal(row.balanceDue).toFixed(2) })),
  };
}

export async function purchaseSummary(client, workspaceId, day) {
  const today = day.toISOString().slice(0, 10);
  const cutoff = nextDay(day.toISOString());
  cutoff.setUTCDate(cutoff.getUTCDate() + 7);
  const [summary] = await client.$queryRaw`
    WITH payments AS (
      SELECT p."billId", SUM(p."amount") AS paid
      FROM "BillPayment" p
      JOIN "Bill" b ON b."id" = p."billId"
      WHERE b."workspaceId" = ${workspaceId} AND p."reversalEntryId" IS NULL
      GROUP BY p."billId"
    ), documents AS (
      SELECT b."id", b."vendorId", b."billNo", b."status", b."postingEntryId", b."date", b."dueDate", b."total", COALESCE(p.paid, 0) AS paid,
        (b."status" = 'RECEIVED' AND b."postingEntryId" IS NOT NULL AND b."total" > COALESCE(p.paid, 0)) AS open
      FROM "Bill" b LEFT JOIN payments p ON p."billId" = b."id"
      WHERE b."workspaceId" = ${workspaceId}
    ), balances AS (
      SELECT d.*, CASE WHEN d."status" = 'RECEIVED' AND d."postingEntryId" IS NOT NULL
        THEN d."total" - d.paid ELSE 0 END AS remaining
      FROM documents d
    )
    SELECT
      COUNT(*) FILTER (WHERE open)::integer AS "openCount",
      COALESCE(SUM(remaining) FILTER (WHERE open), 0)::text AS "openBalance",
      COUNT(*) FILTER (WHERE open AND "dueDate" < ${today}::timestamp)::integer AS "overdueCount",
      COALESCE(SUM(remaining) FILTER (WHERE open AND "dueDate" < ${today}::timestamp), 0)::text AS "overdueBalance",
      COUNT(*) FILTER (WHERE open AND "dueDate" >= ${today}::timestamp AND "dueDate" < ${cutoff.toISOString()}::timestamp)::integer AS "dueSoonCount",
      COALESCE(SUM(remaining) FILTER (WHERE open AND "dueDate" >= ${today}::timestamp AND "dueDate" < ${cutoff.toISOString()}::timestamp), 0)::text AS "dueSoonBalance",
      COALESCE((
        SELECT jsonb_agg(recent ORDER BY recent."date" DESC, recent."id" DESC)
        FROM (
          SELECT b."id", b."billNo", b."status", b."postingEntryId",
            b."date" AT TIME ZONE 'UTC' AS "date", b."dueDate" AT TIME ZONE 'UTC' AS "dueDate",
            b."total"::text AS "total",
            CASE WHEN b."status" = 'PAID' AND b.paid = 0 THEN b."total" ELSE b.paid END::text AS "amountPaid",
            b.remaining::text AS "balanceDue",
            jsonb_build_object('id', v."id", 'name', v."name") AS vendor
          FROM balances b JOIN "Vendor" v ON v."id" = b."vendorId" AND v."workspaceId" = ${workspaceId}
          ORDER BY b."date" DESC, b."id" DESC LIMIT 6
        ) recent
      ), '[]'::jsonb) AS recent
    FROM balances
  `;
  return {
    ...summary,
    openBalance: new Decimal(summary.openBalance).toFixed(2),
    overdueBalance: new Decimal(summary.overdueBalance).toFixed(2),
    dueSoonBalance: new Decimal(summary.dueSoonBalance).toFixed(2),
    recent: summary.recent.map(row => ({ ...row, amountPaid: new Decimal(row.amountPaid).toFixed(2), balanceDue: new Decimal(row.balanceDue).toFixed(2) })),
  };
}

export async function closeChecklist(client, workspaceId, day) {
  const today = day.toISOString().slice(0, 10);
  const [result] = await client.$queryRaw`
    SELECT
      (SELECT COUNT(*)::integer FROM "JournalEntry" WHERE "workspaceId" = ${workspaceId} AND "status" = 'DRAFT') AS "draftJournalEntries",
      (SELECT COUNT(*)::integer FROM "Receipt" WHERE "workspaceId" = ${workspaceId} AND "status" = 'PENDING') AS "pendingReceipts",
      (SELECT COUNT(*)::integer FROM "Invoice" WHERE "workspaceId" = ${workspaceId} AND "status" = 'SENT' AND "postingEntryId" IS NOT NULL AND "dueDate" < ${today}::timestamp) AS "overdueInvoices",
      (SELECT COUNT(*)::integer FROM "Bill" WHERE "workspaceId" = ${workspaceId} AND "status" = 'RECEIVED' AND "postingEntryId" IS NOT NULL AND "dueDate" < ${today}::timestamp) AS "overdueBills",
      (SELECT COUNT(*)::integer FROM "BankTransaction" WHERE "workspaceId" = ${workspaceId} AND "isMatched" = false) AS "unmatchedBankTransactions",
      (SELECT COALESCE(SUM(l."debit"), 0) = COALESCE(SUM(l."credit"), 0)
        FROM "JournalLine" l JOIN "JournalEntry" j ON j."id" = l."journalEntryId"
        WHERE j."workspaceId" = ${workspaceId} AND j."status" = 'POSTED') AS "trialBalanceBalanced",
      (SELECT "statementDate" FROM "Reconciliation"
        WHERE "workspaceId" = ${workspaceId} AND "status" = 'COMPLETE' AND "proof" IS NOT NULL
        ORDER BY "statementDate" DESC LIMIT 1) AS "lastReconciliationAt"
  `;
  return result;
}
