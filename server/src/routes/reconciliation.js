import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import prisma from '../db/prisma.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = express.Router();

function normalize(value) {
  return (value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function similarity(left, right) {
  const leftWords = new Set(normalize(left).split(' ').filter(Boolean));
  const rightWords = new Set(normalize(right).split(' ').filter(Boolean));
  if (!leftWords.size || !rightWords.size) return 0;
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  return shared / Math.max(leftWords.size, rightWords.size);
}

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

router.get('/:accountId/suggestions', async (req, res) => {
  try {
    const { accountId } = req.params;
    const windowDays = Math.min(31, Math.max(1, Number(req.query.windowDays) || 5));
    const account = await prisma.account.findFirst({ where: { id: accountId }, select: { id: true } });
    if (!account) return res.status(404).json({ error: 'Bank account not found' });

    const matchedLineIds = await getMatchedLineIds(req.workspace.id);
    const [bankTransactions, journalLines] = await Promise.all([
      prisma.bankTransaction.findMany({ where: { accountId, isMatched: false }, orderBy: { date: 'asc' } }),
      prisma.journalLine.findMany({
        where: {
          accountId,
          journalEntry: { status: 'POSTED', workspaceId: req.workspace.id },
          NOT: { id: { in: matchedLineIds } },
        },
        include: {
          journalEntry: {
            select: {
              date: true, description: true, referenceNo: true,
              receipt: { select: { id: true, extractedData: true, vendor: { select: { name: true } } } },
              invoices: { select: { id: true, invoiceNo: true, customer: { select: { name: true } } } },
              bills: { select: { id: true, billNo: true, vendor: { select: { name: true } } } },
            },
          },
        },
      }),
    ]);
    const millisecondsPerDay = 86400000;
    const suggestions = bankTransactions.map((transaction) => {
      const candidates = journalLines
        .map((line) => {
          const lineAmount = Math.max(Number(line.debit), Number(line.credit));
          const transactionAmount = Math.abs(Number(transaction.amount));
          const amountDelta = Math.abs(lineAmount - transactionAmount);
          const percentDelta = transactionAmount ? amountDelta / transactionAmount : amountDelta;
          const dateDistance = Math.abs(new Date(line.journalEntry.date).getTime() - new Date(transaction.date).getTime()) / millisecondsPerDay;
          const sourceNames = [
            line.journalEntry.receipt?.vendor?.name,
            ...line.journalEntry.invoices.map((invoice) => invoice.customer?.name),
            ...line.journalEntry.bills.map((bill) => bill.vendor?.name),
            line.journalEntry.description,
            line.description,
          ].filter(Boolean).join(' ');
          const exactAmount = amountDelta <= 0.01;
          if ((!exactAmount && percentDelta > 0.05) || dateDistance > windowDays) return null;
          const nameScore = similarity(transaction.description, sourceNames);
          const score = (exactAmount ? 100 : 50 - percentDelta * 100) + Math.max(0, windowDays - dateDistance) + nameScore * 20;
          const source = line.journalEntry.receipt
            ? { type: 'receipt', id: line.journalEntry.receipt.id, label: line.journalEntry.receipt.vendor?.name ?? 'Receipt' }
            : line.journalEntry.invoices[0]
              ? { type: 'invoice', id: line.journalEntry.invoices[0].id, label: line.journalEntry.invoices[0].invoiceNo }
              : line.journalEntry.bills[0]
                ? { type: 'bill', id: line.journalEntry.bills[0].id, label: line.journalEntry.bills[0].billNo }
                : { type: 'journal', id: line.journalEntryId, label: line.journalEntry.description };
          return { journalLineId: line.id, amount: lineAmount, date: line.journalEntry.date, description: line.description || line.journalEntry.description, source, exactAmount, amountDelta, dateDistance, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      return { bankTransactionId: transaction.id, candidates };
    });
    res.json({ windowDays, suggestions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate match suggestions' });
  }
});

router.get('/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    const account = await prisma.account.findFirst({ where: { id: accountId }, select: { id: true } });
    if (!account) return res.status(404).json({ error: 'Bank account not found' });
    const [bankTransactions, journalLines] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { accountId, isMatched: false },
        orderBy: { date: 'asc' },
      }),
      prisma.journalLine.findMany({
        where: {
          accountId,
          journalEntry: { status: 'POSTED', workspaceId: req.workspace.id },
          NOT: { id: { in: await getMatchedLineIds(req.workspace.id) } },
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

async function getMatchedLineIds(workspaceId) {
  const matched = await prisma.bankTransaction.findMany({
    where: { workspaceId, isMatched: true, matchedLineId: { not: null } },
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

    const [transaction, journalLine] = await Promise.all([
      prisma.bankTransaction.findFirst({ where: { id: bankTransactionId }, select: { id: true, accountId: true } }),
      prisma.journalLine.findFirst({ where: { id: journalLineId, journalEntry: { workspaceId: req.workspace.id } }, select: { id: true, accountId: true } }),
    ]);
    if (!transaction || !journalLine || transaction.accountId !== journalLine.accountId) {
      return res.status(404).json({ error: 'Matching transaction or journal line not found' });
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

    const transaction = await prisma.bankTransaction.findFirst({ where: { id: bankTransactionId }, select: { id: true } });
    if (!transaction) return res.status(404).json({ error: 'Bank transaction not found' });
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
      const matchedLineIds = await getMatchedLineIds(req.workspace.id);
      const candidate = await prisma.journalLine.findFirst({
        where: {
          accountId,
          journalEntry: { status: 'POSTED', workspaceId: req.workspace.id },
          NOT: { id: { in: matchedLineIds } },
          OR: [
            { debit: Math.abs(txn.amount) },
            { credit: Math.abs(txn.amount) },
          ],
          journalEntry: {
            status: 'POSTED',
            workspaceId: req.workspace.id,
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
