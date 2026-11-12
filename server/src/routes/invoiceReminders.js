import express from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import { LedgerError, ledgerDate, ledgerTransaction, sendLedgerError } from '../lib/ledger.js';
import { demand } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { pageOptions } from '../lib/workbenchQueries.js';
import { reminderCandidates, reminderDay, reminderPreview } from '../lib/invoiceReminders.js';
import { isEmailConfigured, sendInvoiceReminderEmail } from '../lib/sendEmail.js';

const router = express.Router();
router.get('/', async (req, res) => {
  try {
    const p = pageOptions(req.query);
    const [data] = await prisma.$queryRaw`WITH due AS (SELECT * FROM (${reminderCandidates(Prisma.sql`i."workspaceId"=${req.workspace.id}`)}) candidates WHERE balance::numeric > 0)
      SELECT (SELECT count(*)::integer FROM due) AS total,
      COALESCE((SELECT jsonb_agg(row) FROM (SELECT * FROM due ORDER BY "dueDate",id LIMIT ${p.pageSize} OFFSET ${p.offset}) row),'[]'::jsonb) AS items`;
    res.json({ ...data, page: p.page, totalPages: Math.max(1, Math.ceil(data.total / p.pageSize)) });
  } catch (error) { sendLedgerError(res, error, 'Invoice reminders could not load.'); }
});
router.get('/:id', async (req, res) => {
  try { res.json(await prisma.$transaction(tx => reminderPreview(tx, req.workspace, req.params.id), { isolationLevel: 'RepeatableRead' })); }
  catch (error) { sendLedgerError(res, error, 'The reminder preview could not load.'); }
});
router.put('/:id', async (req, res) => {
  try {
    demand(req, 'prepare');
    if (typeof req.body.enabled !== 'boolean') throw new LedgerError('Confirm whether reviewed reminders are enabled.');
    res.json(await ledgerTransaction(async tx => {
      const invoice = await tx.invoice.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
      if (!invoice || invoice.status === 'VOID') throw new LedgerError('Current invoice not found.', 404);
      await tx.invoice.update({ where: { id: invoice.id, workspaceId: req.workspace.id }, data: { remindersEnabled: req.body.enabled } });
      await audit(tx, req.workspace.id, 'INVOICE_REMINDERS_CHANGED', invoice.id, { before: invoice.remindersEnabled, after: req.body.enabled });
      return { enabled: req.body.enabled };
    }));
  } catch (error) { sendLedgerError(res, error, 'Reminder preferences could not save.'); }
});
router.post('/:id/send', async (req, res) => {
  let claimed;
  try {
    demand(req, 'prepare');
    const { requestId, snapshot } = req.body;
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new LedgerError('Provide a stable reminder request ID.');
    const claim = await ledgerTransaction(async tx => {
      const prior = await tx.invoiceReminder.findUnique({ where: { workspaceId_requestId: { workspaceId: req.workspace.id, requestId } } });
      if (prior) {
        if (prior.invoiceId !== req.params.id) throw new LedgerError('This request belongs to another invoice.', 409);
        return { record: prior, replayed: true };
      }
      if (!isEmailConfigured()) throw new LedgerError('Email delivery is not configured. Your reminder has not been sent.', 503);
      const preview = await reminderPreview(tx, req.workspace, req.params.id);
      if (!preview.eligible) throw new LedgerError(preview.reason, 409);
      if (preview.snapshot !== snapshot) throw new LedgerError('The balance, recipient or reminder history changed. Review a fresh preview before sending.', 409);
      const record = await tx.invoiceReminder.create({ data: { workspaceId: req.workspace.id, invoiceId: req.params.id, requestId,
        reminderDate: ledgerDate(reminderDay()), recipient: preview.recipient, subject: preview.subject, message: preview.message,
        balance: preview.balance, currency: preview.currency, createdById: req.user.id } });
      await audit(tx, req.workspace.id, 'INVOICE_REMINDER_PREPARED', record.invoiceId, { reminderId:record.id, recipient: record.recipient, balance: record.balance, currency: record.currency });
      return { record, replayed: false };
    });
    if (claim.replayed) return res.json(claim);
    claimed = claim.record;
    const result = await sendInvoiceReminderEmail({ to: claimed.recipient, subject: claimed.subject, message: claimed.message });
    const record = await ledgerTransaction(async tx => {
      const updated = await tx.invoiceReminder.update({ where: { id: claimed.id }, data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.messageId ?? null } });
      await audit(tx, req.workspace.id, 'INVOICE_REMINDER_SENT', claimed.invoiceId, { reminderId: claimed.id }); return updated;
    });
    res.json({ record, replayed: false });
  } catch (error) {
    if (claimed) {
      // Never resend after an ambiguous provider response or bookkeeping failure.
      await prisma.invoiceReminder.updateMany({ where: { id: claimed.id, workspaceId: req.workspace.id, status: 'SENDING' }, data: { status: 'UNCONFIRMED' } }).catch(() => {});
      return res.status(502).json({ error: 'Delivery could not be confirmed. The attempt is retained. Check the mailbox before contacting the customer again; retries will not send another email.', reminderId: claimed.id });
    }
    sendLedgerError(res, error, 'The reminder could not send. Review the invoice and try again.');
  }
});
export default router;
