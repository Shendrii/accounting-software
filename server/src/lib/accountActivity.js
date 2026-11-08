import { getRequestContext } from './requestContext.js';
import { Prisma } from '@prisma/client';
import { Decimal, LedgerError, nextDay } from './ledger.js';
import { pageOptions } from './workbenchQueries.js';

// Aggregate money before looking up source records: a journal can have several legacy links.
export async function accountActivity(prisma, workspaceId, query) {
  const options = pageOptions(query);
  if (typeof query.accountId !== 'string' || query.accountId.length > 100) throw new LedgerError('Choose an account.');
  return prisma.$transaction(async tx => {
    const account = await tx.account.findFirst({ where: { id: query.accountId, workspaceId }, select: { id: true, code: true, name: true, type: true } });
    if (!account) throw new LedgerError('Account not found.', 404);
    const [result] = await tx.$queryRaw`
      WITH source AS (
        SELECT l."id", j."id" AS "entryId", j."date", j."createdAt", j."description", j."referenceNo", j."reversalOfId", l."debit", l."credit"
        FROM "JournalLine" l JOIN "JournalEntry" j ON j."id" = l."journalEntryId"
        WHERE l."accountId" = ${account.id} AND j."workspaceId" = ${workspaceId} AND j."status" = 'POSTED'
          ${options.end ? Prisma.sql`AND j."date" < ${nextDay(options.end).toISOString()}::timestamp` : Prisma.empty}
      ), opening AS (
        SELECT COALESCE(SUM("debit" - "credit"), 0) AS net FROM source WHERE ${options.start ? Prisma.sql`"date" < ${options.start}::timestamp` : Prisma.sql`false`}
      ), period AS (
        SELECT * FROM source ${options.start ? Prisma.sql`WHERE "date" >= ${options.start}::timestamp` : Prisma.empty}
      ), running AS (
        SELECT *, (SELECT net FROM opening) + SUM("debit" - "credit") OVER (ORDER BY "date", "createdAt", "entryId", "id" ROWS UNBOUNDED PRECEDING) AS balance,
          row_number() OVER (ORDER BY "date", "createdAt", "entryId", "id") AS position FROM period
      ), page AS (SELECT * FROM running ORDER BY position LIMIT ${options.pageSize} OFFSET ${options.offset})
      SELECT (SELECT net::text FROM opening) AS opening,
        COALESCE(SUM("debit"), 0)::text AS debit, COALESCE(SUM("credit"), 0)::text AS credit,
        ((SELECT net FROM opening) + COALESCE(SUM("debit" - "credit"), 0))::text AS closing, COUNT(*)::integer AS total,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p."id", 'entryId', p."entryId", 'date', p."date" AT TIME ZONE 'UTC',
          'description', p."description", 'referenceNo', p."referenceNo", 'reversalOfId', p."reversalOfId", 'debit', p."debit"::text, 'credit', p."credit"::text,
          'balance', p.balance::text) ORDER BY p.position) FROM page p), '[]'::jsonb) AS items FROM period
    `;
    const sourceSelect = {
      receipt: { select: { id: true, workspaceId: true } },
      invoices: { where: { workspaceId }, select: { id: true, invoiceNo: true, workspaceId: true } },
      bills: { where: { workspaceId }, select: { id: true, billNo: true, workspaceId: true } },
      invoicePosting: { select: { id: true, invoiceNo: true, workspaceId: true } },
      invoicePayment: { select: { invoice: { select: { id: true, invoiceNo: true, workspaceId: true } } } },
      billPosting: { select: { id: true, billNo: true, workspaceId: true } },
      billPayment: { select: { bill: { select: { id: true, billNo: true, workspaceId: true } } } },
    };
    const entries = result.items.length ? await tx.journalEntry.findMany({ where: { id: { in: result.items.map(row => row.entryId) }, workspaceId }, select: { id: true, ...sourceSelect, reversalOf: { select: { workspaceId: true, ...sourceSelect } } } }) : [];
    function sources(entry) {
      if (!entry || entry.workspaceId && entry.workspaceId !== workspaceId) return [];
      const links = [];
      for (const invoice of [...(entry.invoices ?? []), entry.invoicePosting, entry.invoicePayment?.invoice].filter(Boolean)) {
        if (invoice.workspaceId === workspaceId) links.push({ id: invoice.id, label: invoice.invoiceNo, href: '/sales/invoices/' + invoice.id });
      }
      for (const bill of [...(entry.bills ?? []), entry.billPosting, entry.billPayment?.bill].filter(Boolean)) {
        if (bill.workspaceId === workspaceId) links.push({ id: bill.id, label: bill.billNo, href: '/purchases/bills/' + bill.id });
      }
      if (entry.receipt?.workspaceId === workspaceId) links.push({ id: entry.receipt.id, label: 'Source document', href: '/purchases/documents?receipt=' + entry.receipt.id });
      return [...new Map(links.map(link => [link.href, link])).values()];
    }
    const entriesById = new Map(entries.map(entry => [entry.id, entry]));
    const fixed = value => new Decimal(value).toFixed(2);
    return { account, startDate: options.start, endDate: options.end, currency: getRequestContext().currency ?? 'USD', basis: 'Accrual',
      opening: fixed(result.opening), debit: fixed(result.debit), credit: fixed(result.credit), closing: fixed(result.closing),
      items: result.items.map(row => { const entry = entriesById.get(row.entryId); return { ...row, debit: fixed(row.debit), credit: fixed(row.credit), balance: fixed(row.balance), sources: [...sources(entry?.reversalOf ?? entry),{id:row.entryId,label:row.reversalOfId?'Reversal journal':'Journal entry',href:'/ledger/entries/'+row.entryId}] }; }),
      total: result.total, page: options.page, pageSize: options.pageSize, totalPages: Math.max(1, Math.ceil(result.total / options.pageSize)) };
  }, { isolationLevel: 'RepeatableRead' });
}
