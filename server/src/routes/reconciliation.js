import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

router.post('/import', async (req, res) => {
  try {
    const { accountId, transactions } = req.body;
    if (!accountId || !transactions?.length) {
      return res.status(400).json({ error: 'accountId and transactions are required' });
    }

    const created = await prisma.bankTransaction.createMany({
      data: transactions.map((t) => ({
        accountId,
        date: new Date(t.date),
        description: t.description,
        amount: parseFloat(t.amount),
      })),
    });

    res.status(201).json({ imported: created.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import transactions' });
  }
});

router.get('/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    const [bankTransactions, journalLines] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { accountId, isMatched: false },
        orderBy: { date: 'asc' },
      }),
      prisma.journalLine.findMany({
        where: {
          accountId,
          journalEntry: { status: 'POSTED' },
          NOT: { id: { in: await getMatchedLineIds() } },
        },
        include: { journalEntry: { select: { date: true, description: true, referenceNo: true } } },
        orderBy: { journalEntry: { date: 'asc' } },
      }),
    ]);

    res.json({ bankTransactions, journalLines });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch reconciliation data' });
  }
});

async function getMatchedLineIds() {
  const matched = await prisma.bankTransaction.findMany({
    where: { isMatched: true, matchedLineId: { not: null } },
    select: { matchedLineId: true },
  });
  return matched.map((m) => m.matchedLineId).filter(Boolean);
}

router.post('/match', async (req, res) => {
  try {
    const { bankTransactionId, journalLineId } = req.body;
    if (!bankTransactionId || !journalLineId) {
      return res.status(400).json({ error: 'bankTransactionId and journalLineId are required' });
    }

    await prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { isMatched: true, matchedLineId: journalLineId },
    });

    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'This journal line is already matched' });
    }
    res.status(500).json({ error: 'Failed to match transaction' });
  }
});

router.post('/unmatch', async (req, res) => {
  try {
    const { bankTransactionId } = req.body;
    if (!bankTransactionId) return res.status(400).json({ error: 'bankTransactionId is required' });

    await prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { isMatched: false, matchedLineId: null },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unmatch transaction' });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const { accountId, statementDate, statementBalance } = req.body;
    if (!accountId || !statementDate || statementBalance === undefined) {
      return res.status(400).json({ error: 'accountId, statementDate, and statementBalance are required' });
    }

    const reconciliation = await prisma.reconciliation.create({
      data: {
        accountId,
        statementDate: new Date(statementDate),
        statementBalance: parseFloat(statementBalance),
        status: 'COMPLETE',
      },
    });

    res.status(201).json(reconciliation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete reconciliation' });
  }
});

router.get('/history/:accountId', async (req, res) => {
  try {
    const reconciliations = await prisma.reconciliation.findMany({
      where: { accountId: req.params.accountId },
      orderBy: { statementDate: 'desc' },
    });
    res.json(reconciliations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reconciliation history' });
  }
});

export default router;
