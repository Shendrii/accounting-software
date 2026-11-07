import express from 'express';
import prisma from '../db/prisma.js';
import { accountBalance, cashLedgerAccounts, decimalSum, ledgerBalances, sendLedgerError } from '../lib/ledger.js';
import { closeChecklist, purchaseSummary, salesSummary, summaryDay } from '../lib/workflowSummaries.js';

const router = express.Router();

router.get('/close-checklist', async (req, res) => {
  try {
    res.json(await closeChecklist(prisma, req.workspace.id, summaryDay(req.query.today)));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load the close checklist.');
  }
});

router.get('/', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const day = summaryDay(req.query.today);
    const [accounts, balances, sales, purchases, checklist] = await Promise.all([
      prisma.account.findMany({ where: { workspaceId }, select: { id: true, name: true, type: true } }),
      ledgerBalances(prisma, workspaceId),
      salesSummary(prisma, workspaceId, day),
      purchaseSummary(prisma, workspaceId, day),
      closeChecklist(prisma, workspaceId, day),
    ]);
    const sum = predicate => decimalSum(accounts.filter(predicate).map(account => accountBalance(account, balances)));
    const cashAccounts = await cashLedgerAccounts(prisma, workspaceId, balances);
    const income = sum(account => account.type === 'REVENUE');
    const expenses = sum(account => account.type === 'EXPENSE');
    res.json({
      cashBalance: decimalSum(cashAccounts.map(account => account.balance)).toFixed(2),
      totalIncome: income.toFixed(2),
      totalExpenses: expenses.toFixed(2),
      netIncome: income.minus(expenses).toFixed(2),
      outstandingInvoicesCount: sales.openCount,
      outstandingInvoicesTotal: sales.openBalance,
      sales, purchases, closeChecklist: checklist,
    });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load dashboard data.');
  }
});

export default router;
