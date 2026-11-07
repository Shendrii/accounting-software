import express from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import {
  Decimal, accountBalance, decimalSum, ledgerDate, nextDay, sendLedgerError,
} from '../lib/ledger.js';

const router = express.Router();

function dateRange(startDate, endDate) {
  return {
    ...(startDate && { gte: ledgerDate(startDate) }),
    ...(endDate && { lt: nextDay(endDate) }),
  };
}

async function reportBalances(workspaceId, date) {
  const start = date.gte ? Prisma.sql`AND j."date" >= ${date.gte.toISOString()}::timestamp` : Prisma.empty;
  const end = date.lt ? Prisma.sql`AND j."date" < ${date.lt.toISOString()}::timestamp` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT a."id", a."name", a."code", a."type", SUM(l."debit") AS debit, SUM(l."credit") AS credit
    FROM "Account" a JOIN "JournalLine" l ON l."accountId" = a."id"
    JOIN "JournalEntry" j ON j."id" = l."journalEntryId"
    WHERE a."workspaceId" = ${workspaceId} AND j."workspaceId" = ${workspaceId} AND j."status" = 'POSTED'
      ${start} ${end}
    GROUP BY a."id", a."name", a."code", a."type" ORDER BY a."code" ASC
  `;
  const accounts = rows.map(({ id, name, code, type }) => ({ id, name, code, type }));
  const sums = new Map(rows.map(row => [row.id, { debit: row.debit, credit: row.credit }]));
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
    const asOf = ledgerDate(req.query.asOf ?? req.query.endDate ?? new Date().toISOString(), 'Trial balance date').toISOString().slice(0, 10);
    const cutoff = nextDay(asOf).toISOString();
    const accounts = await prisma.$queryRaw`
      SELECT a."id", a."name", a."code", a."type",
        COALESCE(SUM(CASE WHEN j."id" IS NOT NULL THEN l."debit" - l."credit" ELSE 0 END), 0) AS net
      FROM "Account" a
      LEFT JOIN "JournalLine" l ON l."accountId" = a."id"
      LEFT JOIN "JournalEntry" j ON j."id" = l."journalEntryId" AND j."workspaceId" = ${req.workspace.id}
        AND j."status" = 'POSTED' AND j."date" < ${cutoff}::timestamp
      WHERE a."workspaceId" = ${req.workspace.id}
      GROUP BY a."id", a."name", a."code", a."type" ORDER BY a."code"
    `;
    const rows = accounts.map(account => {
      const net = new Decimal(account.net);
      return {
        accountId: account.id, accountName: account.name, accountCode: account.code, accountType: account.type,
        debitTotal: net.gt(0) ? net.toFixed(2) : '0.00', creditTotal: net.lt(0) ? net.abs().toFixed(2) : '0.00',
      };
    });
    const totals = {
      debitTotal: decimalSum(rows.map(row => row.debitTotal)).toFixed(2),
      creditTotal: decimalSum(rows.map(row => row.creditTotal)).toFixed(2),
    };
    res.json({ asOf, currency: 'USD', basis: 'Accrual', rows, totals,
      difference: decimalSum(rows.map(row => row.debitTotal)).minus(decimalSum(rows.map(row => row.creditTotal))).toFixed(2) });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to generate the trial balance.');
  }
});

export default router;
