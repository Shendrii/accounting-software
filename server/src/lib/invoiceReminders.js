import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Decimal, LedgerError, nextDay } from './ledger.js';

export const reminderDay = () => new Date().toISOString().slice(0, 10);
export function reminderCandidates(condition, today = reminderDay()) {
  return Prisma.sql`SELECT i.id,i."workspaceId",i."invoiceNo",i."dueDate",c.name AS "customerName",c.email,
    (i.total-COALESCE((SELECT SUM(p.amount) FROM "SettlementApplication" p WHERE p."invoiceId"=i.id AND p.date < ${nextDay(today).toISOString()}::timestamp
      AND (p."reversedDate" IS NULL OR p."reversedDate">=${nextDay(today).toISOString()}::timestamp)),0))::text AS balance
    FROM "Invoice" i JOIN "Customer" c ON c.id=i."customerId" AND c."workspaceId"=i."workspaceId"
    JOIN "JournalEntry" j ON j.id=i."postingEntryId" AND j."workspaceId"=i."workspaceId" AND j.status='POSTED' AND j.date < ${nextDay(today).toISOString()}::timestamp
    WHERE ${condition} AND i.status='SENT' AND i."remindersEnabled"=true AND i."dueDate" < ${today}::date
      AND c.email IS NOT NULL AND c.email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      AND NOT EXISTS(SELECT 1 FROM "InvoiceReminder" r WHERE r."invoiceId"=i.id AND r."workspaceId"=i."workspaceId" AND r."reminderDate">${today}::date-INTERVAL '7 days')`;
}

export async function reminderPreview(tx, workspace, id) {
  const invoice = await tx.invoice.findFirst({ where: { id, workspaceId: workspace.id }, include: { customer: true } });
  if (!invoice) throw new LedgerError('Invoice not found.', 404);
  const today = reminderDay();
  const [[candidate], history] = await Promise.all([
    tx.$queryRaw`SELECT * FROM (${reminderCandidates(Prisma.sql`i.id=${id} AND i."workspaceId"=${workspace.id}`, today)}) candidates WHERE balance::numeric > 0`,
    tx.invoiceReminder.findMany({ where: { workspaceId: workspace.id, invoiceId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 }),
  ]);
  const reason = !invoice.remindersEnabled ? 'Turn on reviewed reminders for this invoice.'
    : invoice.status !== 'SENT' || !invoice.postingEntryId ? 'Only posted, open invoices can be reminded.'
    : !invoice.customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.customer.email) ? 'Add a valid email address to the customer record.'
    : !candidate ? 'No reminder is due. The invoice may be settled, not overdue, future-posted, or reminded within the last seven days.' : '';
  const balance = candidate ? new Decimal(candidate.balance).toFixed(2) : null;
  const recipient = invoice.customer.email ?? '';
  const subject = 'Payment reminder - ' + invoice.invoiceNo;
  const message = balance ? 'Hello ' + invoice.customer.name + ',\n\nOur records show an outstanding balance of ' + workspace.currency + ' ' + balance + ' for invoice ' + invoice.invoiceNo + ', due ' + invoice.dueDate.toISOString().slice(0, 10) + '.\n\nIf you have already paid, please send the payment details so we can match them to your account. Otherwise, please let us know when payment is expected.\n\nThank you,\n' + (workspace.legalName ?? workspace.name) : '';
  const snapshot = createHash('sha256').update(JSON.stringify({ id, today, recipient, subject, message, history: history[0]?.id ?? null })).digest('hex');
  return { invoiceId: id, invoiceNo: invoice.invoiceNo, enabled: invoice.remindersEnabled, eligible: Boolean(candidate), reason, recipient, subject, message, balance, currency: workspace.currency, dueDate: invoice.dueDate.toISOString().slice(0, 10), snapshot, history };
}
