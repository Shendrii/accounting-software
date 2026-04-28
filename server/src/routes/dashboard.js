import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

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
