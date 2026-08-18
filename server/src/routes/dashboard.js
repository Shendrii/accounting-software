import express from 'express';
import prisma from '../db/prisma.js';

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
      prisma.invoice.count({ where: { status: 'SENT', dueDate: { lt: now } } }),
      prisma.bill.count({ where: { status: 'RECEIVED', dueDate: { lt: now } } }),
      prisma.bankTransaction.count({ where: { isMatched: false } }),
      prisma.journalLine.aggregate({
        where: { journalEntry: { workspaceId: req.workspace.id, status: 'POSTED' } },
        _sum: { debit: true, credit: true },
      }),
      prisma.reconciliation.findFirst({
        orderBy: { statementDate: 'desc' },
        select: { statementDate: true },
      }),
    ]);
    const debitTotal = Number(trialBalance._sum.debit ?? 0);
    const creditTotal = Number(trialBalance._sum.credit ?? 0);

    res.json({
      draftJournalEntries,
      pendingReceipts,
      overdueInvoices,
      overdueBills,
      unmatchedBankTransactions,
      trialBalanceBalanced: Math.abs(debitTotal - creditTotal) < 0.005,
      lastReconciliationAt: lastReconciliation?.statementDate ?? null,
    });
  } catch (error) {
    console.error('Close checklist error:', error);
    res.status(500).json({ error: 'Failed to load close checklist' });
  }
});

router.get('/', async (req, res) => {
  try {
    const [assetAccounts, revenueAccounts, expenseAccounts, outstandingInvoices] =
      await Promise.all([
        prisma.account.findMany({
          where: {
            type: 'ASSET',
            isActive: true,
            OR: [
              { name: { contains: 'cash', mode: 'insensitive' } },
              { name: { contains: 'bank', mode: 'insensitive' } },
            ],
          },
          select: { balance: true },
        }),
        prisma.account.findMany({
          where: { type: 'REVENUE', isActive: true },
          select: { balance: true },
        }),
        prisma.account.findMany({
          where: { type: 'EXPENSE', isActive: true },
          select: { balance: true },
        }),
        prisma.invoice
          .aggregate({
            where: { status: 'SENT' },
            _count: { id: true },
            _sum: { total: true },
          })
          .catch(() => ({ _count: { id: 0 }, _sum: { total: null } })),
      ]);

    const cashBalance = assetAccounts.reduce(
      (sum, a) => sum + parseFloat(a.balance.toString()),
      0
    );
    const totalIncome = revenueAccounts.reduce(
      (sum, a) => sum + parseFloat(a.balance.toString()),
      0
    );
    const totalExpenses = expenseAccounts.reduce(
      (sum, a) => sum + parseFloat(a.balance.toString()),
      0
    );

    res.json({
      cashBalance: cashBalance.toFixed(2),
      totalIncome: totalIncome.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netIncome: (totalIncome - totalExpenses).toFixed(2),
      outstandingInvoicesCount: outstandingInvoices._count.id ?? 0,
      outstandingInvoicesTotal: outstandingInvoices._sum.total
        ? parseFloat(outstandingInvoices._sum.total.toString()).toFixed(2)
        : '0.00',
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

export default router;
