import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

router.get('/profit-loss', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const whereEntry = { status: 'POSTED' };
    if (Object.keys(dateFilter).length) whereEntry.date = dateFilter;

    const [revenueLines, expenseLines] = await Promise.all([
      prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: whereEntry,
          account: { type: 'REVENUE' },
        },
        _sum: { credit: true, debit: true },
      }),
      prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: whereEntry,
          account: { type: 'EXPENSE' },
        },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const accountIds = [
      ...revenueLines.map((l) => l.accountId),
      ...expenseLines.map((l) => l.accountId),
    ];
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, code: true },
    });
    const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

    const revenue = revenueLines.map((l) => ({
      accountId: l.accountId,
      accountName: accountMap[l.accountId]?.name ?? 'Unknown',
      accountCode: accountMap[l.accountId]?.code ?? '',
      balance: (
        parseFloat((l._sum.credit ?? 0).toString()) - parseFloat((l._sum.debit ?? 0).toString())
      ).toFixed(2),
    }));

    const expenses = expenseLines.map((l) => ({
      accountId: l.accountId,
      accountName: accountMap[l.accountId]?.name ?? 'Unknown',
      accountCode: accountMap[l.accountId]?.code ?? '',
      balance: (
        parseFloat((l._sum.debit ?? 0).toString()) - parseFloat((l._sum.credit ?? 0).toString())
      ).toFixed(2),
    }));

    const totalRevenue = revenue.reduce((s, r) => s + parseFloat(r.balance), 0);
    const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.balance), 0);

    res.json({
      revenue,
      expenses,
      totalRevenue: totalRevenue.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netIncome: (totalRevenue - totalExpenses).toFixed(2),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate profit & loss report' });
  }
});

router.get('/balance-sheet', async (req, res) => {
  try {
    const { asOf } = req.query;

    if (asOf) {
      const asOfDate = new Date(asOf);

      const lines = await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: { status: 'POSTED', date: { lte: asOfDate } },
        },
        _sum: { debit: true, credit: true },
      });

      const accountIds = lines.map((l) => l.accountId);
      const accounts = await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true, code: true, type: true },
      });
      const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

      const grouped = { ASSET: [], LIABILITY: [], EQUITY: [] };
      for (const line of lines) {
        const acc = accountMap[line.accountId];
        if (!acc || !grouped[acc.type]) continue;
        const debit = parseFloat((line._sum.debit ?? 0).toString());
        const credit = parseFloat((line._sum.credit ?? 0).toString());
        const balance = acc.type === 'ASSET' ? debit - credit : credit - debit;
        grouped[acc.type].push({
          accountId: acc.id,
          accountName: acc.name,
          accountCode: acc.code,
          balance: balance.toFixed(2),
        });
      }

      const totalAssets = grouped.ASSET.reduce((s, a) => s + parseFloat(a.balance), 0);
      const totalLiabilities = grouped.LIABILITY.reduce((s, a) => s + parseFloat(a.balance), 0);
      const totalEquity = grouped.EQUITY.reduce((s, a) => s + parseFloat(a.balance), 0);

      return res.json({
        assets: grouped.ASSET,
        liabilities: grouped.LIABILITY,
        equity: grouped.EQUITY,
        totalAssets: totalAssets.toFixed(2),
        totalLiabilities: totalLiabilities.toFixed(2),
        totalEquity: totalEquity.toFixed(2),
      });
    }

    const accounts = await prisma.account.findMany({
      where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, isActive: true },
      select: { id: true, name: true, code: true, type: true, balance: true },
      orderBy: { code: 'asc' },
    });

    const grouped = { ASSET: [], LIABILITY: [], EQUITY: [] };
    for (const acc of accounts) {
      grouped[acc.type].push({
        accountId: acc.id,
        accountName: acc.name,
        accountCode: acc.code,
        balance: parseFloat(acc.balance.toString()).toFixed(2),
      });
    }

    const totalAssets = grouped.ASSET.reduce((s, a) => s + parseFloat(a.balance), 0);
    const totalLiabilities = grouped.LIABILITY.reduce((s, a) => s + parseFloat(a.balance), 0);
    const totalEquity = grouped.EQUITY.reduce((s, a) => s + parseFloat(a.balance), 0);

    res.json({
      assets: grouped.ASSET,
      liabilities: grouped.LIABILITY,
      equity: grouped.EQUITY,
      totalAssets: totalAssets.toFixed(2),
      totalLiabilities: totalLiabilities.toFixed(2),
      totalEquity: totalEquity.toFixed(2),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate balance sheet' });
  }
});

router.get('/trial-balance', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const whereEntry = { status: 'POSTED' };
    if (startDate || endDate) {
      whereEntry.date = {};
      if (startDate) whereEntry.date.gte = new Date(startDate);
      if (endDate) whereEntry.date.lte = new Date(endDate);
    }

    const lines = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { journalEntry: whereEntry },
      _sum: { debit: true, credit: true },
    });

    const accountIds = lines.map((l) => l.accountId);
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, code: true, type: true },
      orderBy: { code: 'asc' },
    });
    const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

    const rows = lines
      .map((l) => {
        const acc = accountMap[l.accountId];
        if (!acc) return null;
        return {
          accountId: l.accountId,
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.type,
          debitTotal: parseFloat((l._sum.debit ?? 0).toString()).toFixed(2),
          creditTotal: parseFloat((l._sum.credit ?? 0).toString()).toFixed(2),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totals = {
      debitTotal: rows.reduce((s, r) => s + parseFloat(r.debitTotal), 0).toFixed(2),
      creditTotal: rows.reduce((s, r) => s + parseFloat(r.creditTotal), 0).toFixed(2),
    };

    res.json({ rows, totals });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate trial balance' });
  }
});

export default router;
