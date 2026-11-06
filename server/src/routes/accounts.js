import express from 'express';
import prisma from '../db/prisma.js';
import { LedgerError, accountBalance, ledgerBalances, ledgerTransaction, sendLedgerError } from '../lib/ledger.js';

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
    const { code, name, type, description, isActive } = req.body;

    if (!code || !name || !type) {
      return res.status(400).json({ error: 'Code, name, and type are required' });
    }

    const account = await prisma.account.create({
      data: {
        code,
        name,
        type,
        description,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    res.status(201).json(account);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Account code already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update account
router.put('/:id', async (req, res) => {
  try {
    const { code, name, type, description, isActive } = req.body;

    const where = { id: req.params.id, workspaceId: req.workspace.id };
    const account = await ledgerTransaction(async tx => {
      const existing = await tx.account.findFirst({ where });
      if (!existing) throw new LedgerError('Account not found.', 404);
      if (type && type !== existing.type && await tx.journalLine.findFirst({
        where: { accountId: existing.id, journalEntry: { workspaceId: where.workspaceId, status: 'POSTED' } },
        select: { id: true },
      })) {
        throw new LedgerError('The type of an account with posted activity cannot be changed.', 409);
      }
      return tx.account.update({
        where,
        data: {
          ...(code && { code }),
          ...(name && { name }),
          ...(type && { type }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive }),
        },
      });
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
    await prisma.account.delete({
      where: { id: req.params.id, workspaceId: req.workspace.id },
    });

    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;

