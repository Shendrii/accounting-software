import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: [{ code: 'asc' }],
    });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get account by ID
router.get('/:id', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        journalLines: {
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

    res.json(account);
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

    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        ...(code && { code }),
        ...(name && { name }),
        ...(type && { type }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json(account);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Account not found' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Account code already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete account
router.delete('/:id', async (req, res) => {
  try {
    await prisma.account.delete({
      where: { id: req.params.id },
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

