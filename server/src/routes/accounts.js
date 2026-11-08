import express from 'express';
import prisma from '../db/prisma.js';
import { LedgerError, accountBalance, ledgerBalances, ledgerTransaction, sendLedgerError } from '../lib/ledger.js';
import { accountRole } from '../lib/accountRoles.js';
import { demand } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';

const router = express.Router();

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const [accounts, balances] = await Promise.all([
      prisma.account.findMany({ where: { workspaceId }, orderBy: { code: 'asc' } }),
      ledgerBalances(prisma, workspaceId),
    ]);
    res.json(accounts.map(account => ({ ...account, balance: accountBalance(account, balances) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get account by ID
router.get('/:id', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, workspaceId },
      include: {
        journalLines: {
          where: { journalEntry: { workspaceId } },
          include: {
            journalEntry: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take:25,
        },
      },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ ...account, balance: accountBalance(account, await ledgerBalances(prisma, workspaceId)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new account
router.post('/', async (req, res) => {
  try {
    demand(req, 'manageBooks');
    const { code, name, type, description, isActive, isBankAccount, role } = req.body;

    if (!code || !name || !type) {
      return res.status(400).json({ error: 'Code, name, and type are required' });
    }
    const usage = accountRole(role, type, isBankAccount);

    const account = await ledgerTransaction(async tx => { const created = await tx.account.create({
      data: {
        workspaceId: req.workspace.id,
        code,
        name,
        type,
        description,
        role: usage, isBankAccount: usage === 'BANK',
        isActive: isActive !== undefined ? isActive : true,
      },
    }); await audit(tx,req.workspace.id,'ACCOUNT_CREATED',created.id,{after:created}); return created; });

    res.status(201).json(account);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Account code already exists' });
    }
    sendLedgerError(res, error, 'Failed to create the account.');
  }
});

// Update account
router.put('/:id', async (req, res) => {
  try {
    demand(req, 'manageBooks');
    const { code, name, type, description, isActive, isBankAccount, role } = req.body;

    const where = { id: req.params.id, workspaceId: req.workspace.id };
    const account = await ledgerTransaction(async tx => {
      const existing = await tx.account.findFirst({ where });
      if (!existing) throw new LedgerError('Account not found.', 404);
      const usage = accountRole(role ?? (isBankAccount === undefined ? existing.role : isBankAccount ? 'BANK' : 'GENERAL'), type ?? existing.type, isBankAccount);
      if (usage !== 'BANK' && existing.isBankAccount && await tx.reconciliation.findFirst({
        where: { accountId: existing.id, workspaceId: where.workspaceId }, select: { id: true },
      })) throw new LedgerError('Keep the bank account designation for accounts with reconciliation history.', 409);
      if (type && type !== existing.type && await tx.journalLine.findFirst({
        where: { accountId: existing.id, journalEntry: { workspaceId: where.workspaceId, status: 'POSTED' } },
        select: { id: true },
      })) {
        throw new LedgerError('The type of an account with posted activity cannot be changed.', 409);
      }
      if (usage !== existing.role && await tx.journalLine.findFirst({
        where: { accountId: existing.id, journalEntry: { workspaceId: where.workspaceId, status: 'POSTED' } }, select: { id: true },
      })) throw new LedgerError('The role of an account with posted activity cannot be changed. Create a separate account.', 409);
      const updated = await tx.account.update({
        where,
        data: {
          ...(code && { code }),
          ...(name && { name }),
          ...(type && { type }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive }),
          role: usage, isBankAccount: usage === 'BANK',
        },
      });
      await audit(tx,where.workspaceId,'ACCOUNT_UPDATED',updated.id,{before:existing,after:updated});
      return updated;
    });

    res.json({ ...account, balance: accountBalance(account, await ledgerBalances(prisma, where.workspaceId)) });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Account not found' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Account code already exists' });
    }
    sendLedgerError(res, error, 'Failed to update the account.');
  }
});

// Delete account
router.delete('/:id', async (req, res) => {
  try {
    demand(req, 'manageBooks');
    await ledgerTransaction(async tx => {
      const where = { id:req.params.id, workspaceId:req.workspace.id };
      const existing = await tx.account.findFirst({where});
      if(!existing) throw new LedgerError('Account not found.',404);
      if(await tx.journalLine.findFirst({where:{accountId:existing.id},select:{id:true}})) throw new LedgerError('This account has transaction history. Deactivate it instead.',409);
      await tx.account.delete({where});
      await audit(tx,req.workspace.id,'ACCOUNT_DELETED',existing.id,{before:existing});
    });

    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Account not found' });
    }
    if(error.code === 'P2003') return res.status(409).json({error:'This account is in use. Deactivate it instead.'});
    sendLedgerError(res,error,'Failed to delete the account.');
  }
});

export default router;

