import express from 'express';
import prisma from '../db/prisma.js';
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
  payments: { include: { journalEntry: { include: journalDetails } }, orderBy: { journalEntry: { date: 'asc' } } },
};

const result = invoice => ({ ...invoice, ...invoiceAmounts(invoice) });
const invoiceWhere = req => ({ id: req.params.id, workspaceId: req.workspace.id });

async function getInvoice(tx, where) {
  const invoice = await tx.invoice.findFirst({ where, include: detail });
  if (!invoice) throw new LedgerError('Invoice not found.', 404);
  return invoice;
}

async function generateInvoiceNo(tx, workspaceId) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = 'INV-' + now.getFullYear() + month + '-';
  const last = await tx.invoice.findFirst({
    where: { workspaceId, invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: 'desc' },
  });
  const seq = last ? parseInt(last.invoiceNo.split('-')[2], 10) + 1 : 1;
  return prefix + String(seq).padStart(4, '0');
}

async function checkCustomer(tx, workspaceId, id) {
  const customer = typeof id === 'string' && await tx.customer.findFirst({ where: { id, workspaceId } });
  if (!customer) throw new LedgerError('Choose a customer from this workspace.');
}

async function draftLines(tx, workspaceId, input) {
  if (!Array.isArray(input) || input.length === 0) throw new LedgerError('Enter at least one invoice line.');
  const lines = input.map(line => {
    if (typeof line?.description !== 'string' || !line.description.trim()) {
      throw new LedgerError('Enter a description for each line.');
    }
    const quantity = decimalInput(line.quantity, 'Quantity', 4);
    const unitPrice = decimalInput(line.unitPrice, 'Unit price');
    if (quantity.isZero()) throw new LedgerError('Quantity must be greater than zero.');
    const amount = quantity.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      description: line.description.trim(), quantity, unitPrice,
      amount: decimalInput(amount, 'Line amount'), accountId: line.accountId || null,
    };
  });
  const accountIds = lines.map(line => line.accountId).filter(Boolean);
  const accounts = await ledgerAccounts(tx, workspaceId, accountIds);
  if ([...accounts.values()].some(account => account.type !== 'REVENUE')) {
    throw new LedgerError('Choose revenue accounts for invoice lines.');
  }
  return lines;
}

function totals(subtotal, tax) {
  const total = decimalInput(subtotal.plus(tax), 'Invoice total');
  if (total.isZero()) throw new LedgerError('Invoice total must be greater than zero.');
  return { subtotal, tax, total };
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
      include: { customer: { select: { id: true, name: true } }, payments: { select: { amount: true } } },
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
    const workspaceId = req.workspace.id;
    const { customerId, date, dueDate, notes, tax } = req.body;
    const invoiceDate = ledgerDate(date, 'Invoice date');
    const due = ledgerDate(dueDate, 'Due date');
    if (due < invoiceDate) throw new LedgerError('Due date cannot precede the invoice date.');
    const taxAmount = decimalInput(tax ?? 0, 'Tax');
    const invoice = await ledgerTransaction(async tx => {
      await checkCustomer(tx, workspaceId, customerId);
      const lines = await draftLines(tx, workspaceId, req.body.lines);
      return tx.invoice.create({
        data: {
          workspaceId, invoiceNo: await generateInvoiceNo(tx, workspaceId), customerId,
          date: invoiceDate, dueDate: due, notes,
          ...totals(decimalSum(lines.map(line => line.amount)), taxAmount),
          lines: { create: lines },
        },
        include: detail,
      });
    });
    res.status(201).json(result(invoice));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to create the invoice.');
  }
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
      return tx.invoice.update({
        where,
        data: {
          customerId, date: invoiceDate, dueDate: due, notes,
          ...(replacement || tax !== undefined ? totals(subtotal, taxAmount) : {}),
          ...(replacement && { lines: { deleteMany: {}, create: replacement } }),
        },
        include: detail,
      });
    });
    res.json(result(invoice));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to update the invoice.');
  }
});

router.post('/:id/post', async (req, res) => {
  try {
    const where = invoiceWhere(req);
    const { receivableAccountId, revenueAccountId, taxAccountId, confirmUnposted } = req.body;
    const invoice = await ledgerTransaction(async tx => {
      const existing = await getInvoice(tx, where);
      if (existing.postingEntry) return existing;
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
      return tx.invoice.update({ where, data: { status: 'SENT', postingEntryId: posting.id }, include: detail });
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
      if (invoice.status !== 'SENT' || !invoice.postingEntry) {
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
      if (existing.status === 'PAID' || existing.payments.length || existing.journalEntryId) {
        throw new LedgerError('An invoice with a recorded payment cannot be voided.', 409);
      }
      if (existing.postingEntry) {
        const date = ledgerDate(req.body?.date ?? new Date().toISOString(), 'Reversal date');
        if (date < ledgerDate(existing.postingEntry.date.toISOString())) {
          throw new LedgerError('The reversal date cannot precede the posting date.');
        }
        await reversePosting(tx, where.workspaceId, existing.postingEntry, date, 'Void invoice ' + existing.invoiceNo);
      } else if (existing.status === 'SENT' && await tx.journalEntry.findFirst({
        where: { workspaceId: where.workspaceId, status: 'POSTED', referenceNo: existing.invoiceNo },
        select: { id: true },
      })) {
        throw new LedgerError('A journal already references this older invoice. Review it with your bookkeeper before voiding.', 409);
      }
      return tx.invoice.update({ where, data: { status: 'VOID' }, include: detail });
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
        lines: { include: { account: { select: { name: true } } } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'VOID') return res.status(409).json({ error: 'A void invoice cannot be sent.' });

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

export default router;
