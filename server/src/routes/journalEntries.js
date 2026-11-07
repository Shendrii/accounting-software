import express from 'express';
import prisma from '../db/prisma.js';
import {
  LedgerError, checkBankPostingDate, journalLines, ledgerAccounts, ledgerDate, ledgerTransaction, nextDay,
  reversePosting, sendLedgerError, updateBalanceCache,
} from '../lib/ledger.js';

const router = express.Router();
const withLines = { journalLines: { include: { account: true } } };
const withSources = {
  ...withLines,
  receipt: { include: { vendor: { select: { name: true } } } },
  invoices: { include: { customer: { select: { name: true } } } },
  bills: { include: { vendor: { select: { name: true } } } },
  billPosting: { select: { id: true, billNo: true } },
  billPayment: { select: { bill: { select: { id: true, billNo: true } } } },
  invoicePosting: { select: { id: true, invoiceNo: true } },
  invoicePayment: { select: { invoice: { select: { id: true, invoiceNo: true } } } },
  reversal: { select: { id: true } },
};
const listDetails = {
  ...withSources,
  journalLines: { include: { account: { select: { id: true, name: true, code: true, type: true } } } },
  receipt: { select: { id: true, vendor: { select: { name: true } } } },
  invoices: { select: { id: true, invoiceNo: true, customer: { select: { name: true } } } },
  bills: { select: { id: true, billNo: true, vendor: { select: { name: true } } } },
};

function scopedEntry(req) {
  return { id: req.params.id, workspaceId: req.workspace.id };
}

async function requireEntry(tx, where, include = withLines) {
  const entry = await tx.journalEntry.findFirst({ where, include });
  if (!entry) throw new LedgerError('Journal entry not found.', 404);
  return entry;
}

router.get('/', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const where = { workspaceId: req.workspace.id };
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = ledgerDate(startDate);
      if (endDate) where.date.lt = nextDay(endDate);
    }
    res.json(await prisma.journalEntry.findMany({ where, include: listDetails, orderBy: { date: 'desc' } }));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load journal entries.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    res.json(await requireEntry(prisma, scopedEntry(req), withSources));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load the journal entry.');
  }
});

router.post('/', async (req, res) => {
  try {
    const { date, description, referenceNo } = req.body;
    if (typeof description !== 'string' || !description.trim()) throw new LedgerError('Enter a description.');
    const workspaceId = req.workspace.id;
    const lines = journalLines(req.body.journalLines);
    const postingDate = ledgerDate(date);
    const entry = await ledgerTransaction(async tx => {
      await ledgerAccounts(tx, workspaceId, lines.map(line => line.accountId));
      return tx.journalEntry.create({
        data: {
          workspaceId, date: postingDate, description: description.trim(), referenceNo,
          status: 'DRAFT', journalLines: { create: lines },
        },
        include: withLines,
      });
    });
    res.status(201).json(entry);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to create the journal entry.');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const where = scopedEntry(req);
    const { date, description, referenceNo, status, journalLines: input } = req.body;
    if (status !== undefined && !['DRAFT', 'ARCHIVED', 'POSTED'].includes(status)) throw new LedgerError('Invalid journal status.');
    if (description !== undefined && (typeof description !== 'string' || !description.trim())) {
      throw new LedgerError('Enter a description.');
    }
    const postingDate = date === undefined ? undefined : ledgerDate(date);
    const replacement = input === undefined ? undefined : journalLines(input);
    const entry = await ledgerTransaction(async tx => {
      const existing = await requireEntry(tx, where);
      if (existing.status === 'POSTED') throw new LedgerError('Posted entries are read-only. Record a reversal to correct them.', 409);
      if (status === 'POSTED' && existing.status !== 'DRAFT') throw new LedgerError('Restore this entry to draft before posting.');
      const lines = status === 'POSTED' ? (replacement ?? journalLines(existing.journalLines)) : replacement;
      const accounts = lines && await ledgerAccounts(tx, where.workspaceId, lines.map(line => line.accountId));
      if (status === 'POSTED') await checkBankPostingDate(tx, where.workspaceId, postingDate ?? existing.date, accounts);
      const updated = await tx.journalEntry.update({
        where,
        data: {
          date: postingDate,
          description: description?.trim(),
          referenceNo,
          status,
          ...(replacement && { journalLines: { deleteMany: {}, create: replacement } }),
        },
        include: withLines,
      });
      if (status === 'POSTED') await updateBalanceCache(tx, where.workspaceId, lines, accounts);
      return updated;
    });
    res.json(entry);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to update the journal entry.');
  }
});

router.post('/:id/post', async (req, res) => {
  try {
    const where = scopedEntry(req);
    const entry = await ledgerTransaction(async tx => {
      const existing = await requireEntry(tx, where);
      if (existing.status === 'POSTED') return existing;
      if (existing.status !== 'DRAFT') throw new LedgerError('Only drafts can be posted.', 409);
      const lines = journalLines(existing.journalLines);
      const accounts = await ledgerAccounts(tx, where.workspaceId, lines.map(line => line.accountId));
      await checkBankPostingDate(tx, where.workspaceId, existing.date, accounts);
      const posted = await tx.journalEntry.update({ where, data: { status: 'POSTED' }, include: withLines });
      await updateBalanceCache(tx, where.workspaceId, lines, accounts);
      return posted;
    });
    res.json(entry);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to post the journal entry.');
  }
});

router.post('/:id/reverse', async (req, res) => {
  try {
    const where = scopedEntry(req);
    const date = ledgerDate(req.body.date, 'Reversal date');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) throw new LedgerError('Enter a reason for the reversal.');
    const reversal = await ledgerTransaction(async tx => {
      const entry = await requireEntry(tx, where, withSources);
      if (entry.status !== 'POSTED' || entry.reversalOfId) throw new LedgerError('Choose an original posted entry.', 409);
      if (entry.invoicePosting || entry.invoicePayment || entry.billPosting || entry.billPayment || entry.invoices.length || entry.bills.length || entry.receipt) {
        throw new LedgerError('Correct this entry from its source transaction.', 409);
      }
      if (entry.reversal) return requireEntry(tx, { id: entry.reversal.id, workspaceId: where.workspaceId });
      if (date < ledgerDate(entry.date.toISOString())) throw new LedgerError('The reversal date cannot precede the posting date.');
      return reversePosting(tx, where.workspaceId, entry, date, reason);
    });
    res.json(reversal);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to reverse the journal entry.');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const where = scopedEntry(req);
    await ledgerTransaction(async tx => {
      const entry = await requireEntry(tx, where);
      if (entry.status === 'POSTED') throw new LedgerError('Posted entries are read-only.', 409);
      await tx.journalEntry.delete({ where });
    });
    res.status(204).send();
  } catch (error) {
    sendLedgerError(res, error, 'Failed to delete the journal entry.');
  }
});

export default router;
