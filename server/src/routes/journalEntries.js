import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

// Get all journal entries
router.get('/', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const journalEntries = await prisma.journalEntry.findMany({
      where,
      include: {
        journalLines: {
          include: {
            account: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    res.json(journalEntries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get journal entry by ID
router.get('/:id', async (req, res) => {
  try {
    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: {
        journalLines: {
          include: {
            account: true,
          },
        },
      },
    });

    if (!journalEntry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    res.json(journalEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new journal entry
router.post('/', async (req, res) => {
  try {
    const { date, description, referenceNo, journalLines } = req.body;

    if (!date || !description || !journalLines || !Array.isArray(journalLines)) {
      return res.status(400).json({ 
        error: 'Date, description, and journalLines array are required' 
      });
    }

    // Validate double-entry bookkeeping: total debits must equal total credits
    const totalDebits = journalLines.reduce((sum, line) => {
      return sum + parseFloat(line.debit || 0);
    }, 0);

    const totalCredits = journalLines.reduce((sum, line) => {
      return sum + parseFloat(line.credit || 0);
    }, 0);

    if (totalDebits !== totalCredits) {
      return res.status(400).json({ 
        error: 'Total debits must equal total credits',
        debits: totalDebits,
        credits: totalCredits,
      });
    }

    // Validate that each line has either debit or credit (not both, not neither)
    for (const line of journalLines) {
      const hasDebit = parseFloat(line.debit || 0) > 0;
      const hasCredit = parseFloat(line.credit || 0) > 0;

      if (!hasDebit && !hasCredit) {
        return res.status(400).json({ 
          error: 'Each journal line must have either a debit or credit amount' 
        });
      }

      if (hasDebit && hasCredit) {
        return res.status(400).json({ 
          error: 'Each journal line cannot have both debit and credit amounts' 
        });
      }

      if (!line.accountId) {
        return res.status(400).json({ 
          error: 'Each journal line must have an accountId' 
        });
      }
    }

    // Create journal entry with lines in a transaction
    const journalEntry = await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          date: new Date(date),
          description,
          referenceNo,
          status: 'DRAFT',
          journalLines: {
            create: journalLines.map(line => ({
              accountId: line.accountId,
              debit: parseFloat(line.debit || 0),
              credit: parseFloat(line.credit || 0),
              description: line.description,
            })),
          },
        },
        include: {
          journalLines: {
            include: {
              account: true,
            },
          },
        },
      });

      return entry;
    });

    res.status(201).json(journalEntry);
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid account ID' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update journal entry
router.put('/:id', async (req, res) => {
  try {
    const { date, description, referenceNo, status, journalLines } = req.body;

    const existingEntry = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: { journalLines: true },
    });

    if (!existingEntry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    // If entry is posted, only allow status changes
    if (existingEntry.status === 'POSTED' && journalLines) {
      return res.status(400).json({ 
        error: 'Cannot modify journal lines of a posted entry' 
      });
    }

    // If updating journal lines, validate double-entry
    if (journalLines && Array.isArray(journalLines)) {
      const totalDebits = journalLines.reduce((sum, line) => {
        return sum + parseFloat(line.debit || 0);
      }, 0);

      const totalCredits = journalLines.reduce((sum, line) => {
        return sum + parseFloat(line.credit || 0);
      }, 0);

      if (totalDebits !== totalCredits) {
        return res.status(400).json({ 
          error: 'Total debits must equal total credits' 
        });
      }
    }

    const journalEntry = await prisma.$transaction(async (tx) => {
      // Delete existing lines if new ones are provided
      if (journalLines && Array.isArray(journalLines)) {
        await tx.journalLine.deleteMany({
          where: { journalEntryId: req.params.id },
        });
      }

      // Update entry
      const entry = await tx.journalEntry.update({
        where: { id: req.params.id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(description && { description }),
          ...(referenceNo !== undefined && { referenceNo }),
          ...(status && { status }),
          ...(journalLines && Array.isArray(journalLines) && {
            journalLines: {
              create: journalLines.map(line => ({
                accountId: line.accountId,
                debit: parseFloat(line.debit || 0),
                credit: parseFloat(line.credit || 0),
                description: line.description,
              })),
            },
          }),
        },
        include: {
          journalLines: {
            include: {
              account: true,
            },
          },
        },
      });

      return entry;
    });

    res.json(journalEntry);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid account ID' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Post journal entry (change status from DRAFT to POSTED)
router.post('/:id/post', async (req, res) => {
  try {
    const journalEntry = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: 'POSTED' },
      include: {
        journalLines: {
          include: {
            account: true,
          },
        },
      },
    });

    // Update account balances
    await prisma.$transaction(
      journalEntry.journalLines.map(line =>
        prisma.account.update({
          where: { id: line.accountId },
          data: {
            balance: {
              increment: parseFloat(line.debit) - parseFloat(line.credit),
            },
          },
        })
      )
    );

    res.json(journalEntry);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete journal entry
router.delete('/:id', async (req, res) => {
  try {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
    });

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    if (entry.status === 'POSTED') {
      return res.status(400).json({ 
        error: 'Cannot delete a posted journal entry' 
      });
    }

    await prisma.journalEntry.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;

