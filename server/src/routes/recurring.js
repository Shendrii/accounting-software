import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

/**
 * Compute the next due date from a given date + interval.
 * Intervals: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
 */
function addInterval(date, interval) {
  const d = new Date(date);
  switch (interval) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d;
}

async function generateBillNo() {
  const now = new Date();
  const prefix = `BILL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const last = await prisma.bill.findFirst({
    where: { billNo: { startsWith: prefix } },
    orderBy: { billNo: 'desc' },
  });
  const seq = last ? parseInt(last.billNo.split('-')[2]) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function generateJournalRefNo() {
  const now = new Date();
  const prefix = `JE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const last = await prisma.journalEntry.findFirst({
    where: { referenceNo: { startsWith: prefix } },
    orderBy: { referenceNo: 'desc' },
  });
  const seq = last ? parseInt(last.referenceNo.split('-')[2]) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * POST /api/recurring/run
 * Creates due recurring instances and advances their nextDueDate.
 * Safe to call on every login or on a schedule.
 */
router.post('/run', async (req, res) => {
  const now = new Date();
  const details = [];

  try {
    // ── Recurring Bills ───────────────────────────────────────────────────
    const dueBills = await prisma.bill.findMany({
      where: {
        isRecurring: true,
        status: { not: 'VOID' },
        nextDueDate: { lte: now },
      },
      include: { lines: true },
    });

    for (const bill of dueBills) {
      const newBillNo = await generateBillNo();
      const newDate = new Date(bill.nextDueDate);
      const newDueDate = addInterval(newDate, bill.recurrenceInterval ?? 'monthly');

      await prisma.bill.create({
        data: {
          billNo: newBillNo,
          vendorId: bill.vendorId,
          date: newDate,
          dueDate: newDueDate,
          status: 'DRAFT',
          total: bill.total,
          notes: bill.notes,
          isRecurring: false,
          lines: {
            create: bill.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              amount: l.amount,
              accountId: l.accountId,
            })),
          },
        },
      });

      // Advance the template's nextDueDate
      await prisma.bill.update({
        where: { id: bill.id },
        data: { nextDueDate: addInterval(bill.nextDueDate, bill.recurrenceInterval ?? 'monthly') },
      });

      details.push(`Bill ${newBillNo} created from recurring template ${bill.billNo}`);
    }

    // ── Recurring Journal Entries ─────────────────────────────────────────
    const dueEntries = await prisma.journalEntry.findMany({
      where: {
        isRecurring: true,
        status: { not: 'ARCHIVED' },
        nextDueDate: { lte: now },
      },
      include: { journalLines: true },
    });

    for (const entry of dueEntries) {
      const refNo = await generateJournalRefNo();
      const newDate = new Date(entry.nextDueDate);

      await prisma.journalEntry.create({
        data: {
          date: newDate,
          description: entry.description,
          referenceNo: refNo,
          status: 'DRAFT',
          isRecurring: false,
          journalLines: {
            create: entry.journalLines.map((l) => ({
              accountId: l.accountId,
              debit: l.debit,
              credit: l.credit,
              description: l.description,
            })),
          },
        },
      });

      await prisma.journalEntry.update({
        where: { id: entry.id },
        data: { nextDueDate: addInterval(entry.nextDueDate, entry.recurrenceInterval ?? 'monthly') },
      });

      details.push(`Journal Entry ${refNo} created from recurring template ${entry.referenceNo ?? entry.id}`);
    }

    res.json({ created: details.length, details });
  } catch (error) {
    console.error('Recurring run error:', error);
    res.status(500).json({ error: 'Failed to run recurring transactions' });
  }
});

/**
 * GET /api/recurring/bills
 * Returns all recurring bill templates.
 */
router.get('/bills', async (req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      where: { isRecurring: true, status: { not: 'VOID' } },
      include: { vendor: { select: { name: true } }, lines: true },
      orderBy: { nextDueDate: 'asc' },
    });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recurring bills' });
  }
});

/**
 * GET /api/recurring/journal-entries
 * Returns all recurring journal entry templates.
 */
router.get('/journal-entries', async (req, res) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { isRecurring: true, status: { not: 'ARCHIVED' } },
      include: { journalLines: { include: { account: { select: { name: true, code: true } } } } },
      orderBy: { nextDueDate: 'asc' },
    });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recurring journal entries' });
  }
});

export default router;
