import express from 'express';
import { reversePaymentHandler } from '../lib/paymentCorrection.js';
import prisma from '../db/prisma.js';
import {audit} from '../lib/audit.js';
import {reasonInput} from '../lib/settlements.js';
import { assertPermission } from '../lib/permissions.js';
import {taxDraft,taxCode,taxPostingAccount,recordTax} from '../lib/tax.js';
import { purchaseSummary, summaryDay } from '../lib/workflowSummaries.js';
import { checkDates, checkVendor, checkPaidReceiptReference, createDraftBill, draftLines, vendorReference } from '../lib/billDraft.js';
import { purchaseAccount, requireAccountRole } from '../lib/accountRoles.js';
import {
  Decimal, LedgerError, createPosting, decimalInput, decimalSum, ledgerAccounts, ledgerDate,
  ledgerTransaction, nextDay, reversePosting, sendLedgerError,
} from '../lib/ledger.js';

import { isPaged, documentPage } from '../lib/workbenchQueries.js';

const router = express.Router();
const posting = { journalLines: { include: { account: { select: { name: true, type: true } } } } };
const detail = {
  vendor: true, lines: { include: { account: { select: { id: true, name: true, code: true } } } },
  journalEntry: { include: posting }, postingEntry: { include: posting },
  creditAllocations: {include:{credit:true}},
  payments: { include: { reversalEntry: true, journalEntry: { include: posting } }, orderBy: { journalEntry: { date: 'asc' } } },
  receipts: { select: { id: true, createdAt: true } },
};

const billWhere = req => ({ id: req.params.id, workspaceId: req.workspace.id });

function billAmounts(bill) {
  const total = new Decimal(bill.total);
  const paid = bill.status === 'PAID' && !bill.postingEntryId ? total : decimalSum([...bill.payments.filter(item => !item.reversalEntryId),...(bill.creditAllocations??[]).filter(item=>!item.reversedDate)].map(item => item.amount));
  const balanceDue = ['RECEIVED','PAID'].includes(bill.status) && bill.postingEntryId ? total.minus(paid).toFixed(2) : '0.00';
  return { ...bill, amountPaid: paid.toFixed(2), balanceDue };
}

async function getBill(tx, where) {
  const bill = await tx.bill.findFirst({ where, include: detail });
  if (!bill) throw new LedgerError('Bill not found.', 404);
  return bill;
}

router.get('/', async (req, res) => {
  try {
    if (isPaged(req.query)) return res.json(await documentPage(prisma, req.workspace.id, 'bill', req.query));
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
      where, include: { vendor: { select: { id: true, name: true } }, creditAllocations: true, payments: { select: { amount: true, reversalEntryId: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(bills.map(billAmounts));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load bills.');
  }
});

router.get('/summary', async (req, res) => {
  try {
    res.json(await purchaseSummary(prisma, req.workspace.id, summaryDay(req.query.today)));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load the purchases summary.');
  }
});

router.get('/:id', async (req, res) => {
  try { res.json(billAmounts(await getBill(prisma, billWhere(req)))); }
  catch (error) { sendLedgerError(res, error, 'Failed to load the bill.'); }
});

router.post('/', async (req, res) => {
  try {
    const bill = await ledgerTransaction(tx => createDraftBill(tx, req.workspace.id, req.body, detail));
    res.status(201).json(billAmounts(bill));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to create the bill.');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const where = billWhere(req);
    const { vendorId, date, dueDate, lines, notes, vendorInvoiceNo } = req.body;
    const bill = await ledgerTransaction(async tx => {
      const current = await getBill(tx, where);
      if (current.status !== 'DRAFT') throw new LedgerError('Only draft bills can be edited.', 409);
      if (vendorId !== undefined) await checkVendor(tx, where.workspaceId, vendorId);
      await checkPaidReceiptReference(tx, where.workspaceId, vendorId ?? current.vendorId, vendorInvoiceNo === undefined ? current.vendorInvoiceNo : vendorReference(vendorInvoiceNo));
      const billDate = date === undefined ? current.date : ledgerDate(date, 'Bill date');
      const due = dueDate === undefined ? current.dueDate : ledgerDate(dueDate, 'Due date');
      checkDates(billDate, due);
      const draft = lines === undefined ? null : await draftLines(tx, where.workspaceId, lines);
      const tax=taxDraft({tax:req.body.tax??current.tax,taxCodeId:req.body.taxCodeId??current.taxCodeId});
      const code=await taxCode(tx,where.workspaceId,tax.taxCodeId,'INPUT',billDate);
      if(tax.tax.gt(0)&&(!code||code.purpose==='EXEMPT'))throw new LedgerError('Select an input-tax code for recoverable tax.');
      const updated=await tx.bill.update({
        where, data: {
          vendorId, date: billDate, dueDate: due, notes,
          ...(vendorInvoiceNo !== undefined && { vendorInvoiceNo: vendorReference(vendorInvoiceNo) }),
          ...tax,total:(draft?.total??decimalSum(current.lines.map(l=>l.amount))).plus(tax.tax),
          ...(draft && { lines: { deleteMany: {}, create: draft.lines } }),
        },
        include: detail,
      });
      await audit(tx,where.workspaceId,'BILL_DRAFT_UPDATED',updated.id,{before:current,after:updated});return updated;
    });
    res.json(billAmounts(bill));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to update the bill.');
  }
});

async function payableAccount(tx, workspaceId) {
  const accounts = await tx.account.findMany({
    where: { workspaceId, type: 'LIABILITY', isActive: true, role: 'ACCOUNTS_PAYABLE' },
  });
  const account = accounts.length === 1 ? accounts[0] : null;
  if (!account) throw new LedgerError('Designate one active Accounts Payable account in Chart of accounts.');
  return account.id;
}

router.post('/:id/receive', async (req, res) => {
  try {
    const where = billWhere(req);
    const bill = await ledgerTransaction(async tx => {
      const current = await getBill(tx, where);
      if (current.status === 'RECEIVED' && current.postingEntryId) return current;
      if (current.status !== 'DRAFT') throw new LedgerError('Only draft bills can be posted.', 409);
      await checkPaidReceiptReference(tx, where.workspaceId, current.vendorId, current.vendorInvoiceNo);
      if (current.lines.some(line => !line.accountId)) throw new LedgerError('Assign an expense or asset account to every bill line before posting.');
      if (!current.total.gt(0) || !decimalSum(current.lines.map(line => line.amount)).plus(current.tax).eq(current.total)) {
        throw new LedgerError('The bill total does not agree with its lines. Edit the draft before posting.');
      }
      const accounts = await ledgerAccounts(tx, where.workspaceId, current.lines.map(line => line.accountId));
      if ([...accounts.values()].some(account => !purchaseAccount(account))) {
        throw new LedgerError('Choose expense or general asset accounts for all bill lines.');
      }
      const ap = await payableAccount(tx, where.workspaceId);
      const code=await taxCode(tx,where.workspaceId,current.taxCodeId,'INPUT',current.date);
      const taxAccount=current.tax.gt(0)?await taxPostingAccount(tx,where.workspaceId,code,'INPUT'):null;
      const entry = await createPosting(tx, where.workspaceId, {
        date: ledgerDate(current.date.toISOString(), 'Bill date'), description: 'Bill posted: ' + current.billNo, referenceNo: current.billNo,
        lines: [
          ...current.lines.filter(line => line.amount.gt(0)).map(line => ({ accountId: line.accountId, debit: line.amount, description: line.description })),
          ...(taxAccount?[{accountId:taxAccount,debit:current.tax}]:[]),
          { accountId: ap, credit: current.total },
        ],
      });
      await audit(tx,where.workspaceId,'BILL_POSTED',current.id,{postingEntryId:entry.id,date:current.date,total:current.total,currency:req.workspace.currency});
      if(code||current.tax.gt(0))await recordTax(tx,req.workspace,code,{source:'BILL',sourceId:current.id,postingEntryId:entry.id,date:current.date,baseAmount:current.total.minus(current.tax),amount:current.tax});
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
      if (!['RECEIVED','PAID'].includes(current.status) || !billPosting || billPosting.status !== 'POSTED' || billPosting.workspaceId !== where.workspaceId) {
        throw new LedgerError('Post an unpaid bill before recording a payment.', 409);
      }
      if (paymentDate < ledgerDate(billPosting.date.toISOString())) throw new LedgerError('The payment date cannot precede the bill posting date.');
      const payable = billPosting.journalLines.filter(line => line.credit.gt(0) && line.account.type === 'LIABILITY');
      if (payable.length !== 1 || !payable[0].credit.eq(current.total) ||
          billPosting.journalLines.some(line => line.accountId === payable[0].accountId && line.debit.gt(0))) {
        throw new LedgerError('The original Accounts Payable posting could not be verified.', 409);
      }
      const accounts = await ledgerAccounts(tx, where.workspaceId, [paymentAccountId]);
      requireAccountRole(accounts.get(paymentAccountId), ['CASH', 'BANK', 'CREDIT_CARD'], 'Payment account');
      const remaining = new Decimal(billAmounts(current).balanceDue);
      const paid = requested ?? remaining;
      if (paid.lte(0) || paid.gt(remaining)) throw new LedgerError('Payment must be positive and cannot exceed the balance due.');
      const entry = await createPosting(tx, where.workspaceId, {
        date: paymentDate, description: 'Payment recorded for ' + current.billNo, referenceNo: current.billNo,
        lines: [{ accountId: payable[0].accountId, debit: paid }, { accountId: paymentAccountId, credit: paid }],
      }, true);
      await audit(tx,where.workspaceId,'BILL_PAYMENT_RECORDED',current.id,{amount:paid,date:paymentDate,paymentAccountId,postingEntryId:entry.id,currency:req.workspace.currency});
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
      if (current.isOpeningBalance) throw new LedgerError('Finalized opening documents cannot be voided. Their original balances remain part of the opening proof.', 409);
      if (current.status === 'PAID' || current.payments.some(payment => !payment.reversalEntryId) || current.creditAllocations.some(a=>!a.reversedDate)) throw new LedgerError('A bill with a recorded payment cannot be voided.', 409);
      if (current.status === 'RECEIVED') {
        assertPermission('correct');
        const entry = current.postingEntry ?? current.journalEntry;
        if (!entry || entry.workspaceId !== where.workspaceId || entry.status !== 'POSTED') throw new LedgerError('The original bill posting could not be verified.', 409);
        if (date < ledgerDate(entry.date.toISOString())) throw new LedgerError('The void date cannot precede the bill posting date.');
        await reversePosting(tx, where.workspaceId, entry, date, 'Void bill '+current.billNo+' · '+reasonInput(req.body.reason,'Void reason'));
      }
      const updated=await tx.bill.update({ where, data: { status: 'VOID' }, include: detail });await audit(tx,where.workspaceId,'BILL_VOIDED',updated.id,{before:current,after:updated,date},req.body.reason);return updated;
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

router.post('/:id/payments/:paymentId/reverse', reversePaymentHandler('bill', getBill, billAmounts));

export default router;
