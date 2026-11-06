import express from 'express';
import prisma from '../db/prisma.js';
import {
  Decimal, LedgerError, createPosting, decimalInput, decimalSum, ledgerAccounts, ledgerDate,
  ledgerTransaction, nextDay, reversePosting, sendLedgerError,
} from '../lib/ledger.js';

const router = express.Router();
const posting = { journalLines: { include: { account: { select: { name: true, type: true } } } } };
const detail = {
  vendor: true, lines: { include: { account: { select: { id: true, name: true, code: true } } } },
  journalEntry: { include: posting }, postingEntry: { include: posting },
  payments: { include: { journalEntry: { include: posting } }, orderBy: { journalEntry: { date: 'asc' } } },
  receipts: { select: { id: true, createdAt: true } },
};

const billWhere = req => ({ id: req.params.id, workspaceId: req.workspace.id });

function billAmounts(bill) {
  const total = new Decimal(bill.total);
  const paid = bill.status === 'PAID' && !bill.payments.length ? total : decimalSum(bill.payments.map(item => item.amount));
  const balanceDue = bill.status === 'RECEIVED' && bill.postingEntryId ? total.minus(paid).toFixed(2) : '0.00';
  return { ...bill, amountPaid: paid.toFixed(2), balanceDue };
}

async function getBill(tx, where) {
  const bill = await tx.bill.findFirst({ where, include: detail });
  if (!bill) throw new LedgerError('Bill not found.', 404);
  return bill;
}

async function generateBillNo(tx, workspaceId) {
  const now = new Date();
  const prefix = 'BILL-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + '-';
  const last = await tx.bill.findFirst({ where: { workspaceId, billNo: { startsWith: prefix } }, orderBy: { billNo: 'desc' } });
  return prefix + String(last ? Number(last.billNo.split('-')[2]) + 1 : 1).padStart(4, '0');
}

async function draftLines(tx, workspaceId, input) {
  if (!Array.isArray(input) || !input.length) throw new LedgerError('Enter at least one bill line.');
  const lines = input.map(line => {
    if (typeof line?.description !== 'string' || !line.description.trim()) throw new LedgerError('Enter a description for every bill line.');
    const quantity = decimalInput(line.quantity, 'Quantity', 4);
    const unitPrice = decimalInput(line.unitPrice, 'Unit price');
    if (quantity.isZero()) throw new LedgerError('Quantity must be greater than zero.');
    return {
      description: line.description.trim(), quantity, unitPrice, accountId: line.accountId || null,
      amount: decimalInput(quantity.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP), 'Line amount'),
    };
  });
  const accounts = await ledgerAccounts(tx, workspaceId, lines.map(line => line.accountId).filter(Boolean));
  if ([...accounts.values()].some(account => !['ASSET', 'EXPENSE'].includes(account.type))) {
    throw new LedgerError('Choose an expense or asset account for bill lines.');
  }
  const total = decimalInput(decimalSum(lines.map(line => line.amount)), 'Bill total');
  if (total.isZero()) throw new LedgerError('Bill total must be greater than zero.');
  return { lines, total };
}

async function checkVendor(tx, workspaceId, id) {
  if (typeof id !== 'string' || !await tx.vendor.findFirst({ where: { id, workspaceId }, select: { id: true } })) {
    throw new LedgerError('Choose a vendor from this workspace.');
  }
}

function checkDates(date, dueDate) {
  if (dueDate < date) throw new LedgerError('The due date cannot precede the bill date.');
}

router.get('/', async (req, res) => {
  try {
    const { status, vendorId, startDate, endDate } = req.query;
    const where = { workspaceId: req.workspace.id };
    if (status) where.status = status;
    if (vendorId) where.vendorId = vendorId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = ledgerDate(startDate);
      if (endDate) where.date.lt = nextDay(endDate);
    }
    const bills = await prisma.bill.findMany({
      where, include: { vendor: { select: { id: true, name: true } }, payments: { select: { amount: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(bills.map(billAmounts));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load bills.');
  }
});

router.get('/:id', async (req, res) => {
  try { res.json(billAmounts(await getBill(prisma, billWhere(req)))); }
  catch (error) { sendLedgerError(res, error, 'Failed to load the bill.'); }
});

router.post('/', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const { vendorId, date, dueDate, lines, notes, isRecurring, recurrenceInterval, nextDueDate } = req.body;
    const billDate = ledgerDate(date, 'Bill date');
    const due = ledgerDate(dueDate, 'Due date');
    checkDates(billDate, due);
    const bill = await ledgerTransaction(async tx => {
      await checkVendor(tx, workspaceId, vendorId);
      const draft = await draftLines(tx, workspaceId, lines);
      return tx.bill.create({
        data: {
          workspaceId, vendorId, billNo: await generateBillNo(tx, workspaceId), date: billDate, dueDate: due,
          total: draft.total, notes, isRecurring: Boolean(isRecurring),
          recurrenceInterval: isRecurring ? recurrenceInterval ?? 'monthly' : null,
          nextDueDate: isRecurring && nextDueDate ? ledgerDate(nextDueDate, 'Next due date') : null,
          lines: { create: draft.lines },
        },
        include: detail,
      });
    });
    res.status(201).json(billAmounts(bill));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to create the bill.');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const where = billWhere(req);
    const { vendorId, date, dueDate, lines, notes } = req.body;
    const bill = await ledgerTransaction(async tx => {
      const current = await getBill(tx, where);
      if (current.status !== 'DRAFT') throw new LedgerError('Only draft bills can be edited.', 409);
      if (vendorId !== undefined) await checkVendor(tx, where.workspaceId, vendorId);
      const billDate = date === undefined ? current.date : ledgerDate(date, 'Bill date');
      const due = dueDate === undefined ? current.dueDate : ledgerDate(dueDate, 'Due date');
      checkDates(billDate, due);
      const draft = lines === undefined ? null : await draftLines(tx, where.workspaceId, lines);
      return tx.bill.update({
        where, data: {
          vendorId, date: billDate, dueDate: due, notes,
          ...(draft && { total: draft.total, lines: { deleteMany: {}, create: draft.lines } }),
        },
        include: detail,
      });
    });
    res.json(billAmounts(bill));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to update the bill.');
  }
});

async function payableAccount(tx, workspaceId) {
  const accounts = await tx.account.findMany({
    where: { workspaceId, type: 'LIABILITY', isActive: true, name: { contains: 'payable', mode: 'insensitive' } },
  });
  const named = accounts.filter(account => /^(accounts payable|trade payables)(?:\s*[-(].*)?$/i.test(account.name.trim()));
  const account = named.length === 1 ? named[0] : accounts.length === 1 ? accounts[0] : null;
  if (!account) throw new LedgerError('Set up one active Accounts Payable liability account.');
  return account.id;
}

router.post('/:id/receive', async (req, res) => {
  try {
    const where = billWhere(req);
    const bill = await ledgerTransaction(async tx => {
      const current = await getBill(tx, where);
      if (current.status === 'RECEIVED' && current.postingEntryId) return current;
      if (current.status !== 'DRAFT') throw new LedgerError('Only draft bills can be posted.', 409);
      if (current.lines.some(line => !line.accountId)) throw new LedgerError('Assign an expense or asset account to every bill line before posting.');
      if (!current.total.gt(0) || !decimalSum(current.lines.map(line => line.amount)).eq(current.total)) {
        throw new LedgerError('The bill total does not agree with its lines. Edit the draft before posting.');
      }
      const accounts = await ledgerAccounts(tx, where.workspaceId, current.lines.map(line => line.accountId));
      if ([...accounts.values()].some(account => !['ASSET', 'EXPENSE'].includes(account.type))) {
        throw new LedgerError('Choose expense or asset accounts for all bill lines.');
      }
      const ap = await payableAccount(tx, where.workspaceId);
      const entry = await createPosting(tx, where.workspaceId, {
        date: ledgerDate(current.date.toISOString(), 'Bill date'), description: 'Bill posted: ' + current.billNo, referenceNo: current.billNo,
        lines: [
          ...current.lines.filter(line => line.amount.gt(0)).map(line => ({ accountId: line.accountId, debit: line.amount, description: line.description })),
          { accountId: ap, credit: current.total },
        ],
      });
      return tx.bill.update({ where, data: { status: 'RECEIVED', postingEntryId: entry.id }, include: detail });
    });
    res.json(billAmounts(bill));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to post the bill.');
  }
});

router.post('/:id/pay', async (req, res) => {
  try {
    const where = billWhere(req);
    const { paymentAccountId, amount, date, requestId } = req.body;
    const legacy = amount === undefined && date === undefined && requestId === undefined;
    if (!legacy && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId) || requestId === 'legacy-full-payment')) {
      throw new LedgerError('A valid payment request ID is required.');
    }
    const key = legacy ? 'legacy-full-payment' : requestId;
    const requested = legacy ? null : decimalInput(amount, 'Payment amount');
    const paymentDate = ledgerDate(legacy ? new Date().toISOString() : date, 'Payment date');
    const bill = await ledgerTransaction(async tx => {
      const current = await getBill(tx, where);
      const prior = current.payments.find(payment => payment.requestId === key);
      if (prior) {
        const paidFrom = prior.journalEntry.journalLines.find(line => line.credit.gt(0));
        if (paidFrom?.accountId !== paymentAccountId || !legacy && (!prior.amount.eq(requested) || +prior.journalEntry.date !== +paymentDate)) {
          throw new LedgerError('This request already recorded a different payment.', 409);
        }
        return current;
      }
      const billPosting = current.postingEntry;
      if (current.status !== 'RECEIVED' || !billPosting || billPosting.status !== 'POSTED' || billPosting.workspaceId !== where.workspaceId) {
        throw new LedgerError('Post an unpaid bill before recording a payment.', 409);
      }
      if (paymentDate < ledgerDate(billPosting.date.toISOString())) throw new LedgerError('The payment date cannot precede the bill posting date.');
      const payable = billPosting.journalLines.filter(line => line.credit.gt(0) && line.account.type === 'LIABILITY');
      if (payable.length !== 1 || !payable[0].credit.eq(current.total) ||
          billPosting.journalLines.some(line => line.accountId === payable[0].accountId && line.debit.gt(0))) {
        throw new LedgerError('The original Accounts Payable posting could not be verified.', 409);
      }
      const accounts = await ledgerAccounts(tx, where.workspaceId, [paymentAccountId]);
      if (accounts.get(paymentAccountId).type !== 'ASSET' || paymentAccountId === payable[0].accountId) throw new LedgerError('Choose an asset payment account.');
      const remaining = new Decimal(billAmounts(current).balanceDue);
      const paid = requested ?? remaining;
      if (paid.lte(0) || paid.gt(remaining)) throw new LedgerError('Payment must be positive and cannot exceed the balance due.');
      const entry = await createPosting(tx, where.workspaceId, {
        date: paymentDate, description: 'Payment recorded for ' + current.billNo, referenceNo: current.billNo,
        lines: [{ accountId: payable[0].accountId, debit: paid }, { accountId: paymentAccountId, credit: paid }],
      }, true);
      await tx.billPayment.create({ data: { billId: current.id, journalEntryId: entry.id, requestId: key, amount: paid } });
      return tx.bill.update({
        where, data: { status: paid.eq(remaining) ? 'PAID' : 'RECEIVED', postingEntryId: billPosting.id }, include: detail,
      });
    });
    res.json(billAmounts(bill));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to record the bill payment.');
  }
});

router.post('/:id/void', async (req, res) => {
  try {
    const where = billWhere(req);
    const date = ledgerDate(req.body?.date ?? new Date().toISOString(), 'Void date');
    const bill = await ledgerTransaction(async tx => {
      const current = await getBill(tx, where);
      if (current.status === 'VOID') return current;
      if (current.status === 'PAID' || current.payments.length) throw new LedgerError('A bill with a recorded payment cannot be voided.', 409);
      if (current.status === 'RECEIVED') {
        const entry = current.postingEntry ?? current.journalEntry;
        if (!entry || entry.workspaceId !== where.workspaceId || entry.status !== 'POSTED') throw new LedgerError('The original bill posting could not be verified.', 409);
        if (date < ledgerDate(entry.date.toISOString())) throw new LedgerError('The void date cannot precede the bill posting date.');
        await reversePosting(tx, where.workspaceId, entry, date, 'Void bill ' + current.billNo);
      }
      return tx.bill.update({ where, data: { status: 'VOID' }, include: detail });
    });
    res.json(billAmounts(bill));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to void the bill.');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const where = billWhere(req);
    await ledgerTransaction(async tx => {
      const current = await getBill(tx, where);
      if (current.status !== 'DRAFT') throw new LedgerError('Only draft bills can be deleted.', 409);
      await tx.bill.delete({ where });
    });
    res.status(204).send();
  } catch (error) {
    sendLedgerError(res, error, 'Failed to delete the bill.');
  }
});

export default router;
