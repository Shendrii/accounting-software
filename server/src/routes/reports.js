import express from 'express';
import prisma from '../db/prisma.js';
import {
  accountBalance, decimalSum, ledgerBalances, ledgerDate, nextDay, sendLedgerError,
} from '../lib/ledger.js';

const router = express.Router();

function dateRange(startDate, endDate) {
  return {
    ...(startDate && { gte: ledgerDate(startDate) }),
    ...(endDate && { lt: nextDay(endDate) }),
  };
}

async function reportBalances(workspaceId, date) {
  const sums = await ledgerBalances(prisma, workspaceId, date);
  const accounts = await prisma.account.findMany({
    where: { workspaceId, id: { in: [...sums.keys()] } },
    select: { id: true, name: true, code: true, type: true },
    orderBy: { code: 'asc' },
  });
  return { sums, accounts };
}

function reportRow(account, balance) {
  return {
    accountId: account.id,
    accountName: account.name,
    accountCode: account.code,
    balance: balance.toFixed(2),
  };
}

router.get('/profit-loss', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { sums, accounts } = await reportBalances(req.workspace.id, dateRange(startDate, endDate));
    const revenue = accounts.filter(account => account.type === 'REVENUE').map(account => reportRow(account, accountBalance(account, sums)));
    const expenses = accounts.filter(account => account.type === 'EXPENSE').map(account => reportRow(account, accountBalance(account, sums)));
    const totalRevenue = decimalSum(revenue.map(row => row.balance));
    const totalExpenses = decimalSum(expenses.map(row => row.balance));
    res.json({
      revenue, expenses, totalRevenue: totalRevenue.toFixed(2), totalExpenses: totalExpenses.toFixed(2),
      netIncome: totalRevenue.minus(totalExpenses).toFixed(2),
    });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to generate profit and loss.');
  }
});

router.get('/balance-sheet', async (req, res) => {
  try {
    const { asOf } = req.query;
    const { sums, accounts } = await reportBalances(req.workspace.id, dateRange(undefined, asOf));
    const grouped = { ASSET: [], LIABILITY: [], EQUITY: [], REVENUE: [], EXPENSE: [] };
    for (const account of accounts) grouped[account.type].push(reportRow(account, accountBalance(account, sums)));
    const sum = type => decimalSum(grouped[type].map(row => row.balance));
    const unclosedEarnings = sum('REVENUE').minus(sum('EXPENSE'));
    if (!unclosedEarnings.isZero()) {
      grouped.EQUITY.push({ accountId: 'unclosed-earnings', accountName: 'Unclosed earnings', accountCode: '', balance: unclosedEarnings.toFixed(2) });
    }
    const totalAssets = sum('ASSET');
    const totalLiabilities = sum('LIABILITY');
    const totalEquity = sum('EQUITY');
    res.json({
      assets: grouped.ASSET, liabilities: grouped.LIABILITY, equity: grouped.EQUITY,
      totalAssets: totalAssets.toFixed(2), totalLiabilities: totalLiabilities.toFixed(2), totalEquity: totalEquity.toFixed(2),
      difference: totalAssets.minus(totalLiabilities).minus(totalEquity).toFixed(2),
    });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to generate the balance sheet.');
  }
});

router.get('/trial-balance', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { sums, accounts } = await reportBalances(req.workspace.id, dateRange(startDate, endDate));
    const rows = accounts.map(account => ({
      accountId: account.id, accountName: account.name, accountCode: account.code, accountType: account.type,
      debitTotal: sums.get(account.id).debit?.toFixed(2) ?? '0.00',
      creditTotal: sums.get(account.id).credit?.toFixed(2) ?? '0.00',
    }));
    const totals = {
      debitTotal: decimalSum(rows.map(row => row.debitTotal)).toFixed(2),
      creditTotal: decimalSum(rows.map(row => row.creditTotal)).toFixed(2),
    };
    res.json({ rows, totals });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to generate the trial balance.');
  }
});

export default router;
