import express from 'express';
import prisma from '../db/prisma.js';
import { LedgerError, ledgerDate, ledgerTransaction, sendLedgerError } from '../lib/ledger.js';
import { requireBooksAdmin } from '../lib/workspaceBooks.js';
import { closeDates, periodState } from '../lib/periodClose.js';
import { audit } from '../lib/audit.js';
import { demand } from '../lib/permissions.js';
const router = express.Router();
const workspace = (tx, id) => tx.workspace.findUnique({ where: { id } });
async function period(tx, req) {
  const item = await tx.accountingPeriod.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
  if (!item) throw new LedgerError('Accounting period not found.', 404); return item;
}
router.get('/', async (req, res) => {
  try { res.json(await prisma.accountingPeriod.findMany({ where: { workspaceId: req.workspace.id }, orderBy: { endDate: 'desc' }, take: 120 })); }
  catch (error) { sendLedgerError(res, error, 'Close periods could not load.'); }
});
router.post('/', async (req, res) => {
  try { requireBooksAdmin(req); const dates = closeDates(req.body);
    const result = await ledgerTransaction(async tx => {
      const current = await workspace(tx, req.workspace.id);
      if (!current.setupCompletedAt) throw new LedgerError('Complete the workspace business profile first.');
      if (current.booksStartDate && dates.startDate < current.booksStartDate) throw new LedgerError('Start on or after the books starting date.');
      const overlaps = await tx.accountingPeriod.findFirst({ where: { workspaceId: current.id, startDate: { lte: dates.endDate }, endDate: { gte: dates.startDate } } });
      if (overlaps) throw new LedgerError('This period overlaps an existing close. Open that period instead.', 409);
      const previous = await tx.accountingPeriod.findFirst({ where: { workspaceId: current.id }, orderBy: { endDate: 'desc' } });
      const expected = previous ? new Date(previous.endDate.valueOf() + 86400000) : current.booksStartDate;
      if (expected && dates.startDate.valueOf() !== expected.valueOf()) throw new LedgerError('Start the next period on ' + expected.toISOString().slice(0, 10) + ' so no accounting dates are skipped.');
      const item = await tx.accountingPeriod.create({ data: { workspaceId: current.id, ...dates, createdById: req.user.id } });
      await audit(tx, current.id, 'PERIOD_CREATED', item.id, dates); return item;
    }); res.status(201).json(result);
  } catch (error) { sendLedgerError(res, error, 'Close period could not start.'); }
});
router.get('/:id', async (req, res) => {
  try { res.json(await ledgerTransaction(async tx => periodState(tx, await workspace(tx, req.workspace.id), await period(tx, req)))); }
  catch (error) { sendLedgerError(res, error, 'Close evidence could not load.'); }
});
router.put('/:id/accounts/:accountId', async (req, res) => {
  try {
    const { status, ownerId } = req.body;
    if (!['OPEN', 'BLOCKED', 'RECONCILED', 'WAIVED'].includes(status)) throw new LedgerError('Choose a review status.');
    if (['RECONCILED', 'WAIVED'].includes(status)) demand(req, 'close');
    const text = key => { const value = req.body[key] ?? ''; if (typeof value !== 'string' || value.length > 2000) throw new LedgerError('Keep review evidence and notes within 2,000 characters.'); return value.trim(); };
    const support = text('support'); const reason = text('reason'); const dueDate = ledgerDate(req.body.dueDate, 'Review due date');
    if (status === 'RECONCILED' && !support || ['WAIVED', 'BLOCKED'].includes(status) && reason.length < 5) throw new LedgerError('Name the supporting workpaper, or explain the waiver/blocker in at least five characters.');
    const result = await ledgerTransaction(async tx => {
      const item = await period(tx, req); if (item.status !== 'OPEN') throw new LedgerError('Reopen the period before changing its reviews.', 409);
      if (!await tx.workspaceMember.findFirst({ where: { workspaceId: req.workspace.id, userId: ownerId } })) throw new LedgerError('Assign an owner who belongs to this workspace.');
      const state = await periodState(tx, await workspace(tx, req.workspace.id), item);
      const account = state.accounts.find(row => row.id === req.params.accountId); if (!account) throw new LedgerError('This account is not in the close population.', 404);
      if (req.body.fingerprint !== account.fingerprint) throw new LedgerError('The ledger changed. Refresh and inspect the new balance before reviewing it.', 409);
      if (status === 'RECONCILED' && ['BANK', 'CREDIT_CARD'].includes(account.role) && !account.bankProof) throw new LedgerError('Verify a statement ending on this period end, or record an explicit reviewed waiver.');
      const before = account.review;
      const data = { status, ownerId, dueDate, support, reason, fingerprint: account.fingerprint, reviewedById: req.user.id, reviewedAt: new Date() };
      const review = await tx.periodAccountReview.upsert({ where: { periodId_accountId: { periodId: item.id, accountId: account.id } }, create: { periodId: item.id, accountId: account.id, ...data }, update: data });
      await audit(tx, req.workspace.id, 'PERIOD_ACCOUNT_REVIEW', item.id, { accountId: account.id, before, after: review }, reason); return review;
    }); res.json(result);
  } catch (error) { sendLedgerError(res, error, 'Account review could not save.'); }
});
router.post('/:id/close', async (req, res) => {
  try { demand(req, 'close');
    const result = await ledgerTransaction(async tx => {
      const item = await period(tx, req); if (item.status === 'CLOSED') return item;
      if (item.endDate > ledgerDate(new Date().toISOString())) throw new LedgerError('A future accounting period cannot be signed off yet.');
      const current = await workspace(tx, req.workspace.id);
      const state = await periodState(tx, current, item);
      if (!state.canClose || current.separateCloseReviewer && item.createdById === req.user.id) throw new LedgerError('Resolve the close checks and review assignments before signing off.', 409);
      const proof = JSON.parse(JSON.stringify({ accounts: state.accounts, totals: state.totals, gates: state.gates, ar: state.ar, ap: state.ap, currency: state.currency, completed: state.completed, separateReviewer: current.separateCloseReviewer }));
      const closed = await tx.accountingPeriod.update({ where: { id: item.id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: req.user.id, proof } });
      await audit(tx, current.id, 'PERIOD_CLOSED', item.id, { startDate: item.startDate, endDate: item.endDate, proof }); return closed;
    }); res.json(result);
  } catch (error) { sendLedgerError(res, error, 'Period could not close.'); }
});
router.post('/:id/reopen', async (req, res) => {
  try {
    demand(req, 'owner');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 1000) throw new LedgerError('Explain the reopening in 5–1,000 characters.');
    const result = await ledgerTransaction(async tx => {
      const item = await period(tx, req); if (item.status !== 'CLOSED') throw new LedgerError('This period is already open.', 409);
      const affected = await tx.accountingPeriod.findMany({ where: { workspaceId: req.workspace.id, endDate: { gte: item.endDate } } });
      for (const row of affected) {
        await audit(tx, req.workspace.id, 'PERIOD_REOPENED', row.id, { previous: row, reopenedFrom: item.id }, reason);
        await tx.accountingPeriod.update({ where: { id: row.id }, data: { status: 'OPEN', closedAt: null, closedById: null } });
        await tx.periodAccountReview.updateMany({ where: { periodId: row.id }, data: { status: 'OPEN', fingerprint: '' } });
      }
      return { reopened: affected.map(row => row.id) };
    }); res.json(result);
  } catch (error) { sendLedgerError(res, error, 'Period could not reopen.'); }
});
export default router;
