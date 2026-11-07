import express from 'express';
import prisma from '../db/prisma.js';
import { LedgerError, ledgerTransaction, sendLedgerError } from '../lib/ledger.js';
import { hasFinancialRecords, openingPreview, postOpening, profileInput, requireBooksAdmin, starterAccounts } from '../lib/workspaceBooks.js';

const router = express.Router();
router.get('/', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const [workspace, financialRecords, postedEntries] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, include: { openingBalance: true } }),
      hasFinancialRecords(prisma, workspaceId), prisma.journalEntry.count({ where: { workspaceId, status: 'POSTED' } }),
    ]);
    res.json({ ...workspace, role: req.workspace.role, currencyLocked: financialRecords, openingEligible: postedEntries === 0 && !workspace.openingBalance });
  } catch (error) { sendLedgerError(res, error, 'Workspace setup could not load.'); }
});
router.put('/', async (req, res) => {
  try {
    requireBooksAdmin(req);
    const input = profileInput(req.body);
    const workspaceId = req.workspace.id;
    const workspace = await ledgerTransaction(async tx => {
      const current = await tx.workspace.findUnique({ where: { id: workspaceId } });
      const hasRecords = await hasFinancialRecords(tx, workspaceId);
      if (hasRecords && input.currency !== current.currency) throw new LedgerError('Currency is fixed after financial records exist. Existing amounts will not be relabeled.', 409);
      if (hasRecords && current.booksStartDate && input.booksStartDate.getTime() !== current.booksStartDate.getTime()) throw new LedgerError('The books starting date is fixed after financial records exist.', 409);
      const earliest = await tx.journalEntry.findFirst({ where: { workspaceId, status: 'POSTED' }, orderBy: { date: 'asc' }, select: { date: true } });
      if (!current.booksStartDate && earliest && input.booksStartDate > earliest.date) throw new LedgerError('Choose a starting date on or before the first posted entry (' + earliest.date.toISOString().slice(0, 10) + ').');
      if (req.body.createChart === true) {
        if (await tx.account.count({ where: { workspaceId } })) throw new LedgerError('This workspace already has accounts. Keep its chart or add accounts individually.', 409);
        await tx.account.createMany({ data: starterAccounts.map(([code, name, type, role]) => ({ workspaceId, code, name, type, role, isBankAccount: role === 'BANK' })) });
      }
      return tx.workspace.update({ where: { id: workspaceId }, data: { ...input, ...(!hasRecords && !current.setupCompletedAt && current.type === 'PERSONAL' ? { name: input.legalName } : {}), setupCompletedAt: current.setupCompletedAt ?? new Date() } });
    });
    res.json(workspace);
  } catch (error) { sendLedgerError(res, error, 'Workspace setup could not save.'); }
});
router.post('/opening-balances/preview', async (req, res) => {
  try { requireBooksAdmin(req); res.json(await openingPreview(prisma, req.workspace.id, req.body)); }
  catch (error) { sendLedgerError(res, error, 'Opening balances could not be reviewed.'); }
});
router.post('/opening-balances', async (req, res) => {
  try {
    requireBooksAdmin(req);
    const batch = await ledgerTransaction(tx => postOpening(tx, req.workspace.id, req.user.id, req.body));
    res.status(201).json(batch);
  } catch (error) { sendLedgerError(res, error, 'Opening balances could not be posted.'); }
});
export default router;
