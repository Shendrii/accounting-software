import express from 'express';
import { createDraftInvoice, checkCustomer, draftLines, totals } from '../lib/invoiceDraft.js';
import { reversePaymentHandler } from '../lib/paymentCorrection.js';
import prisma from '../db/prisma.js';
import {audit} from '../lib/audit.js';
import {reasonInput} from '../lib/settlements.js';
import { assertPermission } from '../lib/permissions.js';
import {taxCode,recordTax,invoiceSnapshot,invoiceDetails} from '../lib/tax.js';
import { generateInvoicePdf } from '../lib/generateInvoicePdf.js';
import { isSmtpConfigured, sendInvoiceEmail } from '../lib/sendEmail.js';
import {
  Decimal, LedgerError, createPosting, decimalInput, decimalSum, ledgerAccounts, ledgerDate,
  ledgerTransaction, nextDay, reversePosting, sendLedgerError,
} from '../lib/ledger.js';
import { invoiceAmounts } from '../lib/invoiceLedger.js';
import { salesSummary, summaryDay } from '../lib/workflowSummaries.js';
import { requireAccountRole } from '../lib/accountRoles.js';

import { isPaged, documentPage } from '../lib/workbenchQueries.js';

const router = express.Router();
const accountFields = { id: true, name: true, code: true };
const journalDetails = { journalLines: { include: { account: { select: accountFields } } } };
const detail = {
  customer: true,
  lines: { include: { account: { select: accountFields } } },
  journalEntry: true,
  postingEntry: { include: journalDetails },
  creditAllocations: {include:{credit:true}},
  payments: { include: { reversalEntry: true, journalEntry: { include: journalDetails } }, orderBy: { journalEntry: { date: 'asc' } } },
};

const result = invoice => ({ ...invoice, ...invoiceAmounts(invoice) });
const invoiceWhere = req => ({ id: req.params.id, workspaceId: req.workspace.id });

async function getInvoice(tx, where) {
  const invoice = await tx.invoice.findFirst({ where, include: detail });
  if (!invoice) throw new LedgerError('Invoice not found.', 404);
  return invoice;
}

router.get('/', async (req, res) => {
  try {
    if (isPaged(req.query)) return res.json(await documentPage(prisma, req.workspace.id, 'invoice', req.query));
    const { status, customerId, startDate, endDate } = req.query;
    const where = { workspaceId: req.workspace.id };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = ledgerDate(startDate);
      if (endDate) where.date.lt = nextDay(endDate);
    }
    const invoices = await prisma.invoice.findMany({
      where,
      include: { customer: { select: { id: true, name: true } }, creditAllocations: true, payments: { select: { amount: true, reversalEntryId: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(invoices.map(({ payments, ...invoice }) => ({ ...invoice, ...invoiceAmounts({ ...invoice, payments }) })));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to fetch invoices.');
  }
});

router.get('/summary', async (req, res) => {
  try {
    res.json(await salesSummary(prisma, req.workspace.id, summaryDay(req.query.today)));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load the sales summary.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    res.json(result(await getInvoice(prisma, invoiceWhere(req))));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to fetch the invoice.');
  }
});

router.post('/', async (req, res) => {
  try {
    const invoice = await ledgerTransaction(tx => createDraftInvoice(tx, req.workspace.id, req.body, detail));
    res.status(201).json(result(invoice));
  } catch (error) { sendLedgerError(res, error, 'Failed to create the invoice.'); }
});

router.put('/:id', async (req, res) => {
  try {
    const where = invoiceWhere(req);
    const { customerId, date, dueDate, lines, notes, tax } = req.body;
    const invoice = await ledgerTransaction(async tx => {
      const existing = await getInvoice(tx, where);
      if (existing.status !== 'DRAFT' || existing.postingEntryId) throw new LedgerError('Only drafts can be edited.', 409);
      if (customerId !== undefined) await checkCustomer(tx, where.workspaceId, customerId);
      const invoiceDate = date === undefined ? existing.date : ledgerDate(date, 'Invoice date');
      const due = dueDate === undefined ? existing.dueDate : ledgerDate(dueDate, 'Due date');
      if (due < invoiceDate) throw new LedgerError('Due date cannot precede the invoice date.');
      const replacement = lines === undefined ? undefined : await draftLines(tx, where.workspaceId, lines);
      const subtotal = replacement ? decimalSum(replacement.map(line => line.amount)) : existing.subtotal;
      const taxAmount = tax === undefined ? existing.tax : decimalInput(tax, 'Tax');
      const code=await taxCode(tx,where.workspaceId,req.body.taxCodeId??existing.taxCodeId,'OUTPUT',invoiceDate);
      if(code?.purpose==='EXEMPT'&&taxAmount.gt(0))throw new LedgerError('An exempt tax code cannot have a tax amount.');
      const updated=await tx.invoice.update({
        where,
        data: {
          customerId, date: invoiceDate, dueDate: due, notes,
          taxCodeId:code?.id??null,invoiceDetails:invoiceDetails(req.body.invoiceDetails),
          ...(replacement || tax !== undefined ? totals(subtotal, taxAmount) : {}),
          ...(replacement && { lines: { deleteMany: {}, create: replacement } }),
        },
        include: detail,
      });
      await audit(tx,where.workspaceId,'INVOICE_DRAFT_UPDATED',updated.id,{before:existing,after:updated});return updated;
    });
    res.json(result(invoice));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to update the invoice.');
  }
});

router.post('/:id/post', async (req, res) => {
  try {
    const where = invoiceWhere(req);
    const { receivableAccountId, revenueAccountId, confirmUnposted } = req.body;
    const invoice = await ledgerTransaction(async tx => {
      const existing = await getInvoice(tx, where);
      if (existing.postingEntry) return existing;
      const code=await taxCode(tx,where.workspaceId,req.body.taxCodeId??existing.taxCodeId,'OUTPUT',existing.date);
      if(code?.purpose==='EXEMPT'&&existing.tax.gt(0))throw new LedgerError('An exempt code cannot have a tax amount.');
      const taxAccountId=code?.accountId??req.body.taxAccountId;
      if (!['DRAFT', 'SENT'].includes(existing.status)) throw new LedgerError('Only open or draft invoices can be posted.', 409);
      if (existing.status === 'SENT') {
        if (confirmUnposted !== true) throw new LedgerError('Review the ledger for an existing sale before posting this older invoice.', 409);
        const existingJournal = await tx.journalEntry.findFirst({
          where: { workspaceId: where.workspaceId, status: 'POSTED', referenceNo: existing.invoiceNo },
          select: { id: true },
        });
        if (existingJournal || existing.journalEntryId) {
          throw new LedgerError('A journal already references this invoice. Review it with your bookkeeper before proceeding.', 409);
        }
      }

      const revenueLines = existing.lines.filter(line => line.amount.gt(0));
      const credits = revenueLines.map(line => ({
        accountId: line.accountId || revenueAccountId,
        debit: 0,
        credit: line.amount,
        description: line.description,
      }));
      if (!receivableAccountId || credits.some(line => !line.accountId)) {
        throw new LedgerError('Select an accounts receivable account and revenue accounts for all invoice lines.');
      }
      if (existing.tax.gt(0) && !taxAccountId) throw new LedgerError('Select a tax liability account.');
      if (existing.lines.some(line => line.amount.lt(0)) || existing.tax.lt(0) ||
          !decimalSum(credits.map(line => line.credit)).eq(existing.subtotal) ||
          !existing.subtotal.plus(existing.tax).eq(existing.total) || existing.total.lte(0)) {
        throw new LedgerError('Invoice amounts are inconsistent. Review the invoice before posting.', 409);
      }

      const accounts = await ledgerAccounts(tx, where.workspaceId, [
        receivableAccountId, ...credits.map(line => line.accountId), ...(existing.tax.gt(0) ? [taxAccountId] : []),
      ]);
      requireAccountRole(accounts.get(receivableAccountId), ['ACCOUNTS_RECEIVABLE'], 'Receivables account');
      if (existing.tax.gt(0)) requireAccountRole(accounts.get(taxAccountId), ['SALES_TAX'], 'Sales tax account');
      if (credits.some(line => accounts.get(line.accountId).type !== 'REVENUE')) {
        throw new LedgerError('Choose revenue accounts for sales.');
      }
      const lines = [{ accountId: receivableAccountId, debit: existing.total, credit: 0 }, ...credits];
      if (existing.tax.gt(0)) lines.push({ accountId: taxAccountId, debit: 0, credit: existing.tax, description: 'Sales tax' });
      const posting = await createPosting(tx, where.workspaceId, {
        date: existing.date,
        description: 'Invoice ' + existing.invoiceNo,
        referenceNo: existing.invoiceNo,
        lines,
      });
      if (revenueLines.some(line => !line.accountId)) {
        await tx.invoiceLine.updateMany({
          where: { invoiceId: existing.id, accountId: null, amount: { gt: 0 } },
          data: { accountId: revenueAccountId },
        });
      }
      await audit(tx,where.workspaceId,'INVOICE_POSTED',existing.id,{postingEntryId:posting.id,date:existing.date,total:existing.total,currency:req.workspace.currency});
      if(code||existing.tax.gt(0))await recordTax(tx,req.workspace,code,{source:'INVOICE',sourceId:existing.id,postingEntryId:posting.id,date:existing.date,baseAmount:existing.subtotal,amount:existing.tax});
      return tx.invoice.update({ where, data: { status: 'SENT', postingEntryId: posting.id,taxCodeId:code?.id??null,legalSnapshot:await invoiceSnapshot(tx,where.workspaceId,existing) }, include: detail });
    });
    res.json(result(invoice));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to post the invoice.');
  }
});

// Legacy callers use this to record delivery outside the app.
router.post('/:id/send', async (req, res) => {
  try {
    const where = invoiceWhere(req);
    const invoice = await ledgerTransaction(async tx => {
      const existing = await getInvoice(tx, where);
      if (existing.status === 'VOID') throw new LedgerError('A void invoice cannot be sent.', 409);
      if (existing.isOpeningBalance) throw new LedgerError('An opening balance is not a new invoice. Download its opening statement instead.', 409);
      return tx.invoice.update({
        where,
        data: { emailSentAt: existing.emailSentAt ?? new Date(), ...(existing.status === 'DRAFT' && { status: 'SENT' }) },
        include: detail,
      });
    });
    res.json(result(invoice));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to record invoice delivery.');
  }
});

router.post('/:id/record-payment', async (req, res) => {
  try {
    const where = invoiceWhere(req);
    const { paymentAccountId, amount, date, requestId } = req.body;
    if (typeof paymentAccountId !== 'string' || !paymentAccountId) throw new LedgerError('Select a deposit account.');
    const legacy = amount === undefined && date === undefined && requestId === undefined;
    if (!legacy && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId) || requestId === 'legacy-full-payment')) {
      throw new LedgerError('A valid payment request ID is required.');
    }
    const key = legacy ? 'legacy-full-payment' : requestId;
    const requested = legacy ? undefined : decimalInput(amount, 'Payment amount');
    const paymentDate = ledgerDate(legacy ? new Date().toISOString() : date, 'Payment date');

    const payment = await ledgerTransaction(async tx => {
      const invoice = await getInvoice(tx, where);
      const prior = invoice.payments.find(item => item.requestId === key);
      if (prior) {
        const debit = prior.journalEntry.journalLines.find(line => line.debit.gt(0));
        if (debit?.accountId !== paymentAccountId ||
            (!legacy && (!prior.amount.eq(requested) || prior.journalEntry.date.getTime() !== paymentDate.getTime()))) {
          throw new LedgerError('This payment request already belongs to a different payment.', 409);
        }
        return { invoice: result(invoice), journalEntry: prior.journalEntry };
      }
      if (!['SENT','PAID'].includes(invoice.status) || !invoice.postingEntry) {
        throw new LedgerError('Post an open invoice before recording a payment.', 409);
      }
      if (paymentDate < ledgerDate(invoice.postingEntry.date.toISOString())) {
        throw new LedgerError('Payment date cannot precede the invoice posting date.');
      }
      const receivable = invoice.postingEntry.journalLines.find(line => line.debit.gt(0));
      if (!receivable || receivable.accountId === paymentAccountId) throw new LedgerError('Choose a deposit account other than receivables.');

      const accounts = await ledgerAccounts(tx, where.workspaceId, [paymentAccountId]);
      requireAccountRole(accounts.get(paymentAccountId), ['CASH', 'BANK'], 'Deposit account');
      const remaining = new Decimal(invoiceAmounts(invoice).balanceDue);
      const received = requested ?? remaining;
      if (received.lte(0) || received.gt(remaining)) throw new LedgerError('Payment must be positive and cannot exceed the balance due.');

      const journalEntry = await createPosting(tx, where.workspaceId, {
        date: paymentDate,
        description: 'Payment received for ' + invoice.invoiceNo,
        referenceNo: invoice.invoiceNo,
        lines: [
          { accountId: paymentAccountId, debit: received, credit: 0 },
          { accountId: receivable.accountId, debit: 0, credit: received },
        ],
      }, true);
      await tx.invoicePayment.create({ data: { invoiceId: invoice.id, journalEntryId: journalEntry.id, requestId: key, amount: received } });
      await audit(tx,where.workspaceId,'INVOICE_PAYMENT_RECORDED',invoice.id,{amount:received,date:paymentDate,paymentAccountId,postingEntryId:journalEntry.id,currency:req.workspace.currency});
      const updated = await tx.invoice.update({
        where, data: { status: received.eq(remaining) ? 'PAID' : 'SENT' }, include: detail,
      });
      return { invoice: result(updated), journalEntry };
    });
    res.json(payment);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to record the payment.');
  }
});

router.post('/:id/void', async (req, res) => {
  try {
    const where = invoiceWhere(req);
    const invoice = await ledgerTransaction(async tx => {
      const existing = await getInvoice(tx, where);
      if (existing.status === 'VOID') return existing;
      if (existing.status !== 'DRAFT') assertPermission('correct');
      if (existing.isOpeningBalance) throw new LedgerError('Finalized opening documents cannot be voided. Their original balances remain part of the opening proof.', 409);
      if (existing.status === 'PAID' || existing.payments.some(payment => !payment.reversalEntryId) || existing.creditAllocations.some(a=>!a.reversedDate) || existing.journalEntryId) {
        throw new LedgerError('An invoice with a recorded payment cannot be voided.', 409);
      }
      if (existing.postingEntry) {
        const date = ledgerDate(req.body?.date ?? new Date().toISOString(), 'Reversal date');
        if (date < ledgerDate(existing.postingEntry.date.toISOString())) {
          throw new LedgerError('The reversal date cannot precede the posting date.');
        }
        await reversePosting(tx, where.workspaceId, existing.postingEntry, date, 'Void invoice '+existing.invoiceNo+' · '+reasonInput(req.body.reason,'Void reason'));
      } else if (existing.status === 'SENT' && await tx.journalEntry.findFirst({
        where: { workspaceId: where.workspaceId, status: 'POSTED', referenceNo: existing.invoiceNo },
        select: { id: true },
      })) {
        throw new LedgerError('A journal already references this older invoice. Review it with your bookkeeper before voiding.', 409);
      }
      const updated=await tx.invoice.update({ where, data: { status: 'VOID' }, include: detail });await audit(tx,where.workspaceId,'INVOICE_VOIDED',updated.id,{before:existing,after:updated,date:req.body.date},req.body.reason);return updated;
    });
    res.json(result(invoice));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to void the invoice.');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const where = invoiceWhere(req);
    await ledgerTransaction(async tx => {
      const existing = await getInvoice(tx, where);
      if (existing.status !== 'DRAFT' || existing.postingEntryId || existing.journalEntryId) {
        throw new LedgerError('Only unposted drafts can be deleted.', 409);
      }
      await tx.invoice.delete({ where });
    });
    res.status(204).send();
  } catch (error) {
    sendLedgerError(res, error, 'Failed to delete the invoice.');
  }
});

// ── PDF download ──────────────────────────────────────────────────────────
router.get('/:id/pdf', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      include: {
        customer: true,
        creditAllocations: true, payments: { select: { amount: true, reversalEntryId: true } },
        lines: { include: { account: { select: { name: true } } } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const pdf = await generateInvoicePdf(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNo}.pdf"`);
    res.send(pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ── Send PDF via email ─────────────────────────────────────────────────────
router.post('/:id/send-pdf', async (req, res) => {
  if (!isSmtpConfigured()) {
    return res.status(503).json({
      error:
        'Email is not configured. Set SMTP_USER and SMTP_PASS (or GMAIL_USER and GMAIL_APP_PASSWORD) in server/.env',
    });
  }
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      include: {
        customer: true,
        creditAllocations: true, payments: { select: { amount: true, reversalEntryId: true } },
        lines: { include: { account: { select: { name: true } } } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.isOpeningBalance) return res.status(409).json({ error: 'An opening balance is not a new invoice. Download its opening statement instead.' });
    if (invoice.status === 'VOID') return res.status(409).json({ error: 'A void invoice cannot be sent.' });
    if (!invoice.postingEntryId) return res.status(409).json({error:'Post the invoice before emailing it. Draft and unposted PDFs are marked for review.'});

    const email = req.body.email || invoice.customer?.email;
    if (!email) {
      return res.status(400).json({ error: 'No recipient email. Provide email in body or add one to the customer.' });
    }

    const pdf = await generateInvoicePdf(invoice);
    const result = await sendInvoiceEmail({
      to: email,
      invoiceNo: invoice.invoiceNo,
      pdfBuffer: pdf,
      customerName: invoice.customer?.name ?? 'Customer',
    });

    const emailSentAt = new Date();
    await prisma.invoice.update({
      where: invoiceWhere(req),
      data: { emailSentAt },
    });
    res.json({ success: true, messageId: result.messageId, previewUrl: result.previewUrl, emailSentAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to send invoice email' });
  }
});

router.post('/:id/payments/:paymentId/reverse', reversePaymentHandler('invoice', getInvoice, result));

export default router;
