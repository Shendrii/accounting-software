import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

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

router.get('/', async (req, res) => {
  try {
    const { status, vendorId, startDate, endDate } = req.query;
    const where = {};
    if (status) where.status = status;
    if (vendorId) where.vendorId = vendorId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const bills = await prisma.bill.findMany({
      where,
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const bill = await prisma.bill.findFirst({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      include: {
        vendor: true,
        lines: { include: { account: { select: { id: true, name: true, code: true } } } },
        journalEntry: true,
      },
    });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    res.json(bill);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { vendorId, date, dueDate, lines, notes, isRecurring, recurrenceInterval, nextDueDate } = req.body;
    if (!vendorId || !date || !dueDate || !lines?.length) {
      return res.status(400).json({ error: 'vendorId, date, dueDate, and lines are required' });
    }

    const total = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
    const billNo = await generateBillNo();

    const bill = await prisma.bill.create({
      data: {
        billNo,
        vendorId,
        date: new Date(date),
        dueDate: new Date(dueDate),
        total,
        notes,
        isRecurring: Boolean(isRecurring),
        recurrenceInterval: isRecurring ? (recurrenceInterval ?? 'monthly') : null,
        nextDueDate: isRecurring && nextDueDate ? new Date(nextDueDate) : null,
        lines: {
          create: lines.map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity),
            unitPrice: parseFloat(l.unitPrice),
            amount: parseFloat(l.amount),
            accountId: l.accountId || null,
          })),
        },
      },
      include: { vendor: true, lines: true },
    });
    res.status(201).json(bill);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create bill' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.bill.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
    if (!existing) return res.status(404).json({ error: 'Bill not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT bills can be edited' });
    }

    const { vendorId, date, dueDate, lines, notes } = req.body;
    const total = lines ? lines.reduce((s, l) => s + parseFloat(l.amount), 0) : undefined;

    const bill = await prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.billLine.deleteMany({ where: { billId: req.params.id } });
        await tx.billLine.createMany({
          data: lines.map((l) => ({
            billId: req.params.id,
            description: l.description,
            quantity: parseFloat(l.quantity),
            unitPrice: parseFloat(l.unitPrice),
            amount: parseFloat(l.amount),
            accountId: l.accountId || null,
          })),
        });
      }
      return tx.bill.update({
        where: { id: req.params.id },
        data: {
          ...(vendorId && { vendorId }),
          ...(date && { date: new Date(date) }),
          ...(dueDate && { dueDate: new Date(dueDate) }),
          ...(total !== undefined && { total }),
          ...(notes !== undefined && { notes }),
        },
        include: { vendor: true, lines: true },
      });
    });
    res.json(bill);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update bill' });
  }
});

router.post('/:id/receive', async (req, res) => {
  try {
    const bill = await prisma.bill.findFirst({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      include: { lines: true },
    });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (bill.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT bills can be received' });
    }

    const apAccount = await prisma.account.findFirst({
      where: { name: { contains: 'payable', mode: 'insensitive' } },
    });
    if (!apAccount) {
      return res.status(400).json({
        error: 'No Accounts Payable account found. Please create one with "payable" in the name.',
      });
    }

    const amount = parseFloat(bill.total.toString());

    const result = await prisma.$transaction(async (tx) => {
      const lineAccountId = bill.lines.find((l) => l.accountId)?.accountId ?? apAccount.id;

      const entry = await tx.journalEntry.create({
        data: {
          date: new Date(),
          description: `Bill received: ${bill.billNo}`,
          referenceNo: bill.billNo,
          status: 'POSTED',
          journalLines: {
            create: [
              { accountId: lineAccountId, debit: amount, credit: 0 },
              { accountId: apAccount.id, debit: 0, credit: amount },
            ],
          },
        },
      });

      await tx.account.update({
        where: { id: lineAccountId },
        data: { balance: { increment: amount } },
      });
      await tx.account.update({
        where: { id: apAccount.id },
        data: { balance: { increment: amount } },
      });

      return tx.bill.update({
        where: { id: req.params.id },
        data: { status: 'RECEIVED', journalEntryId: entry.id },
      });
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to receive bill' });
  }
});

router.post('/:id/pay', async (req, res) => {
  try {
    const { paymentAccountId } = req.body;
    if (!paymentAccountId) return res.status(400).json({ error: 'paymentAccountId is required' });

    const bill = await prisma.bill.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (bill.status !== 'RECEIVED') {
      return res.status(400).json({ error: 'Only RECEIVED bills can be paid' });
    }

    const apAccount = await prisma.account.findFirst({
      where: { name: { contains: 'payable', mode: 'insensitive' } },
    });
    if (!apAccount) {
      return res.status(400).json({ error: 'No Accounts Payable account found.' });
    }

    const amount = parseFloat(bill.total.toString());

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          date: new Date(),
          description: `Payment for Bill ${bill.billNo}`,
          referenceNo: bill.billNo,
          status: 'POSTED',
          journalLines: {
            create: [
              { accountId: apAccount.id, debit: amount, credit: 0 },
              { accountId: paymentAccountId, debit: 0, credit: amount },
            ],
          },
        },
      });

      await tx.account.update({
        where: { id: apAccount.id },
        data: { balance: { decrement: amount } },
      });
      await tx.account.update({
        where: { id: paymentAccountId },
        data: { balance: { decrement: amount } },
      });

      return tx.bill.update({
        where: { id: req.params.id },
        data: { status: 'PAID', journalEntryId: entry.id },
      });
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to pay bill' });
  }
});

router.post('/:id/void', async (req, res) => {
  try {
    const existing = await prisma.bill.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
    if (!existing) return res.status(404).json({ error: 'Bill not found' });
    if (existing.status === 'PAID') return res.status(400).json({ error: 'Cannot void a paid bill' });
    const bill = await prisma.bill.update({
      where: { id: req.params.id },
      data: { status: 'VOID' },
    });
    res.json(bill);
  } catch (error) {
    res.status(500).json({ error: 'Failed to void bill' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.bill.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
    if (!existing) return res.status(404).json({ error: 'Bill not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT bills can be deleted' });
    }
    await prisma.bill.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete bill' });
  }
});

export default router;
