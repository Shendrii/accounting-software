import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import prisma from '../db/prisma.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

/**
 * POST /api/reconciliation/import-csv
 * Accepts a CSV file upload. Columns detected automatically:
 *   date, description (or memo/narrative), amount (or debit/credit)
 * After import, auto-suggests matches with journal lines (±3 days, same amount).
 */
router.post('/import-csv', upload.single('csv'), async (req, res) => {
  try {
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId is required' });
    if (!req.file) return res.status(400).json({ error: 'csv file is required' });

    const csvText = req.file.buffer.toString('utf-8');
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    if (!records.length) return res.status(400).json({ error: 'CSV file is empty or invalid' });

    // Normalise column names (case-insensitive)
    const headers = Object.keys(records[0]).map((h) => h.toLowerCase().trim());
    const findCol = (...names) => {
      for (const n of names) {
        const h = headers.find((h) => h.includes(n));
        if (h) return Object.keys(records[0]).find((k) => k.toLowerCase().trim() === h);
      }
      return null;
    };

    const dateCol = findCol('date', 'transaction date', 'txn date', 'trans date');
    const descCol = findCol('description', 'memo', 'narrative', 'details', 'note', 'desc');
    const amountCol = findCol('amount', 'amt');
    const debitCol = findCol('debit', 'withdrawal');
    const creditCol = findCol('credit', 'deposit');

    if (!dateCol) return res.status(400).json({ error: 'CSV must have a date column' });
    if (!amountCol && !debitCol && !creditCol) {
      return res.status(400).json({ error: 'CSV must have amount, debit, or credit columns' });
    }

    const transactions = [];
    for (const row of records) {
      const rawDate = row[dateCol];
      const parsed = new Date(rawDate);
      if (isNaN(parsed.getTime())) continue;

      let amount;
      if (amountCol) {
        amount = parseFloat(String(row[amountCol]).replace(/[^0-9.-]/g, ''));
      } else {
        const debit = parseFloat(String(row[debitCol] ?? 0).replace(/[^0-9.-]/g, '')) || 0;
        const credit = parseFloat(String(row[creditCol] ?? 0).replace(/[^0-9.-]/g, '')) || 0;
        amount = credit - debit;
      }

      if (isNaN(amount)) continue;

      const description = descCol ? String(row[descCol]) : 'Imported transaction';
      transactions.push({ date: parsed, description, amount });
    }

    if (!transactions.length) {
      return res.status(400).json({ error: 'No valid transactions found in CSV' });
    }

    // Import, skipping duplicates (same account, date, amount, description)
    let imported = 0;
    for (const t of transactions) {
      const existing = await prisma.bankTransaction.findFirst({
        where: { accountId, date: t.date, amount: t.amount, description: t.description },
      });
      if (!existing) {
        await prisma.bankTransaction.create({
          data: { accountId, date: t.date, description: t.description, amount: t.amount },
        });
        imported++;
      }
    }

    // Auto-suggest matches: find journal lines within ±3 days with same amount
    const importedTxns = await prisma.bankTransaction.findMany({
      where: { accountId, isMatched: false },
    });

    const threeDays = 3 * 24 * 60 * 60 * 1000;
    let suggestions = 0;
    for (const txn of importedTxns) {
      const matchedLineIds = await getMatchedLineIds();
      const candidate = await prisma.journalLine.findFirst({
        where: {
          accountId,
          journalEntry: { status: 'POSTED' },
          NOT: { id: { in: matchedLineIds } },
          OR: [
            { debit: Math.abs(txn.amount) },
            { credit: Math.abs(txn.amount) },
          ],
          journalEntry: {
            status: 'POSTED',
            date: {
              gte: new Date(new Date(txn.date).getTime() - threeDays),
              lte: new Date(new Date(txn.date).getTime() + threeDays),
            },
          },
        },
      });

      if (candidate && !candidate.matchedLineId) {
        await prisma.bankTransaction.update({
          where: { id: txn.id },
          data: { isMatched: true, matchedLineId: candidate.id },
        });
        suggestions++;
      }
    }

    res.status(201).json({ imported, suggestions, total: transactions.length });
  } catch (error) {
    console.error('CSV import error:', error);
    res.status(500).json({ error: 'Failed to import CSV: ' + error.message });
  }
});

export default router;
