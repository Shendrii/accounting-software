import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

/**
 * GET /api/insights
 * Returns a list of smart financial alerts derived purely from existing data.
 * Each alert: { type, severity: 'warning'|'critical'|'info', message, detail }
 */
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const alerts = [];

    // ── 1. Overdue invoices ────────────────────────────────────────────────
    const overdueInvoices = await prisma.invoice.findMany({
      where: { status: 'SENT', dueDate: { lt: now } },
      select: { id: true, invoiceNo: true, total: true, dueDate: true, customer: { select: { name: true } } },
    });
    if (overdueInvoices.length > 0) {
      const total = overdueInvoices.reduce((s, i) => s + parseFloat(i.total.toString()), 0);
      const oldest = overdueInvoices.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
      const daysOld = Math.floor((now - new Date(oldest.dueDate)) / 86400000);
      alerts.push({
        type: 'overdue_invoices',
        severity: total > 5000 ? 'critical' : 'warning',
        message: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''} totalling ${fmt(total)}`,
        detail: `Oldest is ${daysOld} day${daysOld !== 1 ? 's' : ''} overdue — ${oldest.customer?.name ?? 'Unknown'}`,
        link: '/invoices?status=SENT',
      });
    }

    // ── 2. Unpaid bills past due ───────────────────────────────────────────
    const overdueBills = await prisma.bill.findMany({
      where: { status: 'RECEIVED', dueDate: { lt: now } },
      select: { id: true, billNo: true, total: true, dueDate: true, vendor: { select: { name: true } } },
    });
    if (overdueBills.length > 0) {
      const total = overdueBills.reduce((s, b) => s + parseFloat(b.total.toString()), 0);
      alerts.push({
        type: 'overdue_bills',
        severity: 'warning',
        message: `${overdueBills.length} unpaid bill${overdueBills.length > 1 ? 's' : ''} totalling ${fmt(total)}`,
        detail: `These are past their due date. Pay soon to avoid late fees.`,
        link: '/bills?status=RECEIVED',
      });
    }

    // ── 3. Cash balance low / negative ────────────────────────────────────
    const cashAccounts = await prisma.account.findMany({
      where: { type: 'ASSET', isActive: true, name: { contains: 'cash', mode: 'insensitive' } },
      select: { name: true, balance: true },
    });
    const totalCash = cashAccounts.reduce((s, a) => s + parseFloat(a.balance.toString()), 0);
    if (totalCash < 0) {
      alerts.push({
        type: 'negative_cash',
        severity: 'critical',
        message: `Cash balance is negative: ${fmt(totalCash)}`,
        detail: 'Your cash accounts are in deficit. Review recent payments.',
        link: '/bookkeeping',
      });
    }

    // ── 4. Expense spike: compare this month vs. 3-month average ──────────
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start3MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const [thisMonthLines, prevMonthLines] = await Promise.all([
      prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: { status: 'POSTED', date: { gte: startThisMonth } },
          account: { type: 'EXPENSE' },
        },
        _sum: { debit: true },
      }),
      prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: { status: 'POSTED', date: { gte: start3MonthsAgo, lt: startThisMonth } },
          account: { type: 'EXPENSE' },
        },
        _sum: { debit: true },
      }),
    ]);

    const thisMonthTotal = thisMonthLines.reduce((s, l) => s + parseFloat((l._sum.debit ?? 0).toString()), 0);
    const prev3MonthTotal = prevMonthLines.reduce((s, l) => s + parseFloat((l._sum.debit ?? 0).toString()), 0);
    const monthlyAvg = prev3MonthTotal / 3;

    if (monthlyAvg > 0 && thisMonthTotal > monthlyAvg * 2) {
      const pct = Math.round(((thisMonthTotal - monthlyAvg) / monthlyAvg) * 100);
      alerts.push({
        type: 'expense_spike',
        severity: thisMonthTotal > monthlyAvg * 3 ? 'critical' : 'warning',
        message: `Expenses this month are ${pct}% above your 3-month average`,
        detail: `This month: ${fmt(thisMonthTotal)} vs avg ${fmt(monthlyAvg)}/month`,
        link: '/reports',
      });
    }

    // ── 5. Reconciliation gap ──────────────────────────────────────────────
    const lastRecon = await prisma.reconciliation.findFirst({
      where: { status: 'COMPLETE' },
      orderBy: { statementDate: 'desc' },
    });
    if (lastRecon) {
      const daysSince = Math.floor((now - new Date(lastRecon.statementDate)) / 86400000);
      if (daysSince > 30) {
        alerts.push({
          type: 'reconciliation_gap',
          severity: daysSince > 60 ? 'critical' : 'info',
          message: `Bank reconciliation is ${daysSince} days overdue`,
          detail: `Last completed on ${new Date(lastRecon.statementDate).toLocaleDateString()}`,
          link: '/reconciliation',
        });
      }
    } else {
      alerts.push({
        type: 'reconciliation_gap',
        severity: 'info',
        message: 'You have never completed a bank reconciliation',
        detail: 'Regular reconciliation prevents fraud and catches errors early.',
        link: '/reconciliation',
      });
    }

    // ── 6. Pending receipts piling up ──────────────────────────────────────
    const pendingReceipts = await prisma.receipt.count({ where: { status: 'PENDING' } });
    if (pendingReceipts >= 5) {
      alerts.push({
        type: 'pending_receipts',
        severity: 'info',
        message: `${pendingReceipts} receipts awaiting approval`,
        detail: 'Unapproved receipts are not recorded in your books.',
        link: '/receipts',
      });
    }

    // ── 7. Revenue vs. previous month ─────────────────────────────────────
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [thisMonthRevLines, lastMonthRevLines] = await Promise.all([
      prisma.journalLine.aggregate({
        where: {
          journalEntry: { status: 'POSTED', date: { gte: startThisMonth } },
          account: { type: 'REVENUE' },
        },
        _sum: { credit: true },
      }),
      prisma.journalLine.aggregate({
        where: {
          journalEntry: { status: 'POSTED', date: { gte: startLastMonth, lt: startThisMonth } },
          account: { type: 'REVENUE' },
        },
        _sum: { credit: true },
      }),
    ]);

    const thisMonthRev = parseFloat((thisMonthRevLines._sum.credit ?? 0).toString());
    const lastMonthRev = parseFloat((lastMonthRevLines._sum.credit ?? 0).toString());

    if (lastMonthRev > 0 && thisMonthRev < lastMonthRev * 0.5) {
      const pct = Math.round(((lastMonthRev - thisMonthRev) / lastMonthRev) * 100);
      alerts.push({
        type: 'revenue_drop',
        severity: 'warning',
        message: `Revenue is ${pct}% lower than last month`,
        detail: `This month: ${fmt(thisMonthRev)} vs last month: ${fmt(lastMonthRev)}`,
        link: '/reports',
      });
    }

    res.json({ alerts, generatedAt: now.toISOString() });
  } catch (error) {
    console.error('Insights error:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

export default router;
