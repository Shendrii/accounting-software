import express from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import { Decimal, accountBalance, cashLedgerAccounts, decimalSum, ledgerBalances } from '../lib/ledger.js';
import { invoiceAmounts } from '../lib/invoiceLedger.js';

const router = express.Router();

router.get('/close-checklist', async (req, res) => {
  try {
    const now = new Date();
    const [
      draftJournalEntries,
      pendingReceipts,
      overdueInvoices,
      overdueBills,
      unmatchedBankTransactions,
      trialBalance,
      lastReconciliation,
    ] = await Promise.all([
      prisma.journalEntry.count({ where: { status: 'DRAFT' } }),
      prisma.receipt.count({ where: { status: 'PENDING' } }),
      prisma.invoice.count({ where: { status: 'SENT', postingEntryId: { not: null }, dueDate: { lt: now } } }),
      prisma.bill.count({ where: { status: 'RECEIVED', postingEntryId: { not: null }, dueDate: { lt: now } } }),
      prisma.bankTransaction.count({ where: { isMatched: false } }),
      prisma.journalLine.aggregate({
        where: { journalEntry: { workspaceId: req.workspace.id, status: 'POSTED' } },
        _sum: { debit: true, credit: true },
      }),
      prisma.reconciliation.findFirst({
        where: { status: 'COMPLETE', proof: { not: Prisma.DbNull } },
        orderBy: { statementDate: 'desc' },
        select: { statementDate: true },
      }),
    ]);
    const debitTotal = new Decimal(trialBalance._sum.debit ?? 0);

    res.json({
      draftJournalEntries,
      pendingReceipts,
      overdueInvoices,
      overdueBills,
      unmatchedBankTransactions,
      trialBalanceBalanced: debitTotal.eq(trialBalance._sum.credit ?? 0),
      lastReconciliationAt: lastReconciliation?.statementDate ?? null,
    });
  } catch (error) {
    console.error('Close checklist error:', error);
    res.status(500).json({ error: 'Failed to load close checklist' });
  }
});

router.get('/', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const [accounts, balances, invoices] = await Promise.all([
      prisma.account.findMany({ where: { workspaceId }, select: { id: true, name: true, type: true } }),
      ledgerBalances(prisma, workspaceId),
      prisma.invoice.findMany({
        where: { workspaceId, status: 'SENT', postingEntryId: { not: null } },
        include: { payments: { select: { amount: true } } },
      }),
    ]);
    const sum = predicate => decimalSum(accounts.filter(predicate).map(account => accountBalance(account, balances)));
    const cashAccounts = await cashLedgerAccounts(prisma, workspaceId, balances);
    const income = sum(account => account.type === 'REVENUE');
    const expenses = sum(account => account.type === 'EXPENSE');
    const openInvoices = invoices.filter(invoice => new Decimal(invoiceAmounts(invoice).balanceDue).gt(0));
    res.json({
      cashBalance: decimalSum(cashAccounts.map(account => account.balance)).toFixed(2),
      totalIncome: income.toFixed(2),
      totalExpenses: expenses.toFixed(2),
      netIncome: income.minus(expenses).toFixed(2),
      outstandingInvoicesCount: openInvoices.length,
      outstandingInvoicesTotal: decimalSum(openInvoices.map(invoice => invoiceAmounts(invoice).balanceDue)).toFixed(2),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

export default router;
