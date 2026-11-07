import { Prisma } from '@prisma/client';
import { Decimal, LedgerError, ledgerDate, nextDay } from './ledger.js';

function scalar(query, key, fallback = '') {
  const value = query[key] ?? fallback;
  if (typeof value !== 'string') throw new LedgerError('Enter a valid ' + key + '.');
  return value;
}
export function pageOptions(query) {
  const positive = (key, fallback, max) => {
    const value = scalar(query, key, String(fallback));
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new LedgerError('Enter a valid ' + key + '.');
    return Number(value);
  };
  const page = positive('page', 1, 100000);
  const pageSize = positive('pageSize', 25, 100);
  const q = scalar(query, 'q').trim();
  if (q.length > 160) throw new LedgerError('Search must be at most 160 characters.');
  const direction = scalar(query, 'direction', 'desc');
  if (!['asc', 'desc'].includes(direction)) throw new LedgerError('Choose a valid sort direction.');
  const start = query.startDate ? ledgerDate(scalar(query, 'startDate'), 'Start date').toISOString().slice(0, 10) : null;
  const end = query.endDate ? ledgerDate(scalar(query, 'endDate'), 'End date').toISOString().slice(0, 10) : null;
  if (start && end && start > end) throw new LedgerError('The end date cannot precede the start date.');
  return { page, pageSize, offset: (page - 1) * pageSize, q, direction, start, end };
}
export const isPaged = query => query.page !== undefined || query.pageSize !== undefined;
function envelope(options, result) {
  return { items: result.items, page: options.page, pageSize: options.pageSize, total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / options.pageSize)) };
}
const searchPattern = value => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';

export async function documentPage(client, workspaceId, kind, query) {
  const options = pageOptions(query);
  const invoice = kind === 'invoice';
  const table = Prisma.raw(invoice ? '"Invoice"' : '"Bill"');
  const paymentTable = Prisma.raw(invoice ? '"InvoicePayment"' : '"BillPayment"');
  const paymentKey = Prisma.raw(invoice ? '"invoiceId"' : '"billId"');
  const contactTable = Prisma.raw(invoice ? '"Customer"' : '"Vendor"');
  const contactKey = Prisma.raw(invoice ? '"customerId"' : '"vendorId"');
  const reference = Prisma.raw(invoice ? '"invoiceNo"' : '"billNo"');
  const status = scalar(query, 'status');
  if (status && !(invoice ? ['DRAFT', 'SENT', 'PAID', 'VOID'] : ['DRAFT', 'RECEIVED', 'PAID', 'VOID']).includes(status)) throw new LedgerError('Choose a valid document status.');
  const view = scalar(query, 'view', 'all');
  if (!(invoice ? ['all', 'open', 'overdue'] : ['all', 'open', 'overdue', 'due-soon', 'recurring', 'non-void']).includes(view)) throw new LedgerError('Choose a valid document view.');
  const today = ledgerDate(query.today ? scalar(query, 'today') : new Date().toISOString(), 'Today').toISOString().slice(0, 10);
  const through = nextDay(today); through.setUTCDate(through.getUTCDate() + 7);
  const contactId = scalar(query, invoice ? 'customerId' : 'vendorId');
  if (contactId.length > 100) throw new LedgerError('Choose a valid contact.');
  const sort = scalar(query, 'sort', 'date');
  const sorts = { date: '"date"', dueDate: '"dueDate"', reference: 'reference', counterparty: '"contactName"', total: 'total', balance: 'remaining' };
  if (!Object.hasOwn(sorts, sort)) throw new LedgerError('Choose a valid sort column.');
  const ordering = Prisma.sql`${Prisma.raw(sorts[sort])} ${Prisma.raw(options.direction.toUpperCase())}, "id" ${Prisma.raw(options.direction.toUpperCase())}`;
  const paid = invoice ? Prisma.sql`CASE WHEN d."status" = 'PAID' AND d."postingEntryId" IS NULL THEN d."total" ELSE COALESCE(p.paid, 0) END`
    : Prisma.sql`CASE WHEN d."status" = 'PAID' AND p.paid IS NULL THEN d."total" ELSE COALESCE(p.paid, 0) END`;
  const referenceSearch = invoice ? Prisma.empty : Prisma.sql`OR COALESCE("vendorInvoiceNo", '') ILIKE ${searchPattern(options.q)}`;
  const [result] = await client.$queryRaw`
    WITH payments AS (
      SELECT p.${paymentKey} AS document_id, SUM(p."amount") AS paid
      FROM ${paymentTable} p JOIN ${table} d ON d."id" = p.${paymentKey}
      WHERE d."workspaceId" = ${workspaceId} AND p."reversalEntryId" IS NULL GROUP BY p.${paymentKey}
    ), documents AS (
      SELECT d.*, d.${reference} AS reference, c."name" AS "contactName", c."id" AS "contactId", ${paid} AS paid
      FROM ${table} d JOIN ${contactTable} c ON c."id" = d.${contactKey} AND c."workspaceId" = ${workspaceId}
      LEFT JOIN payments p ON p.document_id = d."id" WHERE d."workspaceId" = ${workspaceId}
    ), balances AS (
      SELECT d.*, CASE WHEN d."status" = 'VOID' THEN 0 ELSE d."total" - d.paid END AS remaining,
        (d."status"::text = ${invoice ? 'SENT' : 'RECEIVED'} AND d."postingEntryId" IS NOT NULL AND d."total" > d.paid) AS open
      FROM documents d
    ), filtered AS (
      SELECT * FROM balances WHERE true
        ${status ? Prisma.sql`AND "status"::text = ${status}` : Prisma.empty}
        ${contactId ? Prisma.sql`AND "contactId" = ${contactId}` : Prisma.empty}
        ${options.start ? Prisma.sql`AND "date" >= ${options.start}::timestamp` : Prisma.empty}
        ${options.end ? Prisma.sql`AND "date" < ${nextDay(options.end).toISOString()}::timestamp` : Prisma.empty}
        ${options.q ? Prisma.sql`AND (reference ILIKE ${searchPattern(options.q)} OR "contactName" ILIKE ${searchPattern(options.q)} ${referenceSearch})` : Prisma.empty}
        ${['open', 'overdue', 'due-soon'].includes(view) ? Prisma.sql`AND open` : Prisma.empty}
        ${view === 'overdue' ? Prisma.sql`AND "dueDate" < ${today}::timestamp` : Prisma.empty}
        ${view === 'due-soon' ? Prisma.sql`AND "dueDate" >= ${today}::timestamp AND "dueDate" < ${through.toISOString()}::timestamp` : Prisma.empty}
        ${view === 'recurring' ? Prisma.sql`AND "isRecurring" AND "status" <> 'VOID'` : Prisma.empty}
        ${view === 'non-void' ? Prisma.sql`AND "status" <> 'VOID'` : Prisma.empty}
    ), ranked AS (SELECT *, row_number() OVER (ORDER BY ${ordering}) AS position FROM filtered),
    page AS (SELECT * FROM ranked ORDER BY position LIMIT ${options.pageSize} OFFSET ${options.offset})
    SELECT (SELECT COUNT(*)::integer FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(
        (to_jsonb(p) - 'paid' - 'remaining' - 'open' - 'position' - 'reference' - 'contactName' - 'contactId') ||
        jsonb_build_object('date', p."date" AT TIME ZONE 'UTC', 'dueDate', p."dueDate" AT TIME ZONE 'UTC',
          'total', p."total"::text, 'amountPaid', p.paid::text,
          'balanceDue', CASE WHEN ${invoice} THEN p.remaining ELSE CASE WHEN p.open THEN p.remaining ELSE 0 END END::text,
          ${invoice ? 'customer' : 'vendor'}::text, jsonb_build_object('id', p."contactId", 'name', p."contactName"))
        ORDER BY p.position) FROM page p), '[]'::jsonb) AS items
  `;
  result.items = result.items.map(row => ({ ...row, total: new Decimal(row.total).toFixed(2), amountPaid: new Decimal(row.amountPaid).toFixed(2), balanceDue: new Decimal(row.balanceDue).toFixed(2) }));
  return envelope(options, result);
}

export async function receiptPage(client, workspaceId, query) {
  const options = pageOptions(query);
  const status = scalar(query, 'status');
  if (status && !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) throw new LedgerError('Choose a valid receipt status.');
  const sort = scalar(query, 'sort', 'date');
  const sorts = { date: '"createdAt"', vendor: 'vendor', total: 'total' };
  if (!Object.hasOwn(sorts, sort)) throw new LedgerError('Choose a valid receipt sort column.');
  const ordering = Prisma.sql`${Prisma.raw(sorts[sort])} ${Prisma.raw(options.direction.toUpperCase())} NULLS LAST, "id" ${Prisma.raw(options.direction.toUpperCase())}`;
  const [result] = await client.$queryRaw`
    WITH documents AS (
      SELECT r.*, COALESCE(r."extractedData"->>'vendor', '') AS vendor,
        CASE WHEN COALESCE(r."extractedData"->>'total', r."extractedData"->>'amount', '') ~ '^[0-9]{1,13}(\.[0-9]{1,2})?$'
          THEN COALESCE(r."extractedData"->>'total', r."extractedData"->>'amount')::numeric ELSE NULL END AS total
      FROM "Receipt" r WHERE r."workspaceId" = ${workspaceId}
        ${status ? Prisma.sql`AND r."status"::text = ${status}` : Prisma.empty}
        ${options.start ? Prisma.sql`AND r."createdAt" >= ${options.start}::timestamp` : Prisma.empty}
        ${options.end ? Prisma.sql`AND r."createdAt" < ${nextDay(options.end).toISOString()}::timestamp` : Prisma.empty}
    ), filtered AS (
      SELECT * FROM documents WHERE true
        ${options.q ? Prisma.sql`AND (vendor ILIKE ${searchPattern(options.q)} OR COALESCE("extractedData"->>'invoiceNumber', '') ILIKE ${searchPattern(options.q)} OR COALESCE(category, '') ILIKE ${searchPattern(options.q)})` : Prisma.empty}
    ), ranked AS (SELECT *, row_number() OVER (ORDER BY ${ordering}) AS position FROM filtered),
    page AS (SELECT * FROM ranked ORDER BY position LIMIT ${options.pageSize} OFFSET ${options.offset})
    SELECT (SELECT COUNT(*)::integer FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'vendor' - 'total' - 'position' ORDER BY p.position) FROM page p), '[]'::jsonb) AS items
  `;
  return envelope(options, result);
}
