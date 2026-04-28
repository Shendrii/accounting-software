import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

async function generateInvoiceNo() {
  const now = new Date();
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const last = await prisma.invoice.findFirst({
    where: { invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: 'desc' },
  });
  const seq = last ? parseInt(last.invoiceNo.split('-')[2]) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

router.get('/', async (req, res) => {
  try {
    const { status, customerId, startDate, endDate } = req.query;
    const where = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        lines: { include: { account: { select: { id: true, name: true, code: true } } } },
        journalEntry: true,
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customerId, date, dueDate, lines, notes, tax } = req.body;
    if (!customerId || !date || !dueDate || !lines?.length) {
      return res.status(400).json({ error: 'customerId, date, dueDate, and lines are required' });
    }

    const subtotal = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
    const taxAmount = parseFloat(tax ?? 0);
    const total = subtotal + taxAmount;
    const invoiceNo = await generateInvoiceNo();

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo,
        customerId,
        date: new Date(date),
        dueDate: new Date(dueDate),
        subtotal,
        tax: taxAmount,
        total,
        notes,
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
      include: { customer: true, lines: true },
    });
    res.status(201).json(invoice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT invoices can be edited' });
    }

    const { customerId, date, dueDate, lines, notes, tax } = req.body;
    const subtotal = lines ? lines.reduce((s, l) => s + parseFloat(l.amount), 0) : undefined;
    const taxAmount = tax !== undefined ? parseFloat(tax) : undefined;
    const total = subtotal !== undefined ? subtotal + (taxAmount ?? 0) : undefined;

    const invoice = await prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: req.params.id } });
        await tx.invoiceLine.createMany({
          data: lines.map((l) => ({
            invoiceId: req.params.id,
            description: l.description,
            quantity: parseFloat(l.quantity),
            unitPrice: parseFloat(l.unitPrice),
            amount: parseFloat(l.amount),
            accountId: l.accountId || null,
          })),
        });
      }
      return tx.invoice.update({
        where: { id: req.params.id },
        data: {
          ...(customerId && { customerId }),
          ...(date && { date: new Date(date) }),
          ...(dueDate && { dueDate: new Date(dueDate) }),
          ...(subtotal !== undefined && { subtotal }),
          ...(taxAmount !== undefined && { tax: taxAmount }),
          ...(total !== undefined && { total }),
          ...(notes !== undefined && { notes }),
        },
        include: { customer: true, lines: true },
      });
    });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.post('/:id/send', async (req, res) => {
  try {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT invoices can be sent' });
    }
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'SENT' },
    });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

router.post('/:id/record-payment', async (req, res) => {
  try {
    const { paymentAccountId } = req.body;
    if (!paymentAccountId) {
      return res.status(400).json({ error: 'paymentAccountId is required' });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { customer: true },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'PAID') return res.status(400).json({ error: 'Invoice already paid' });
    if (invoice.status === 'VOID') return res.status(400).json({ error: 'Invoice is void' });

    const arAccount = await prisma.account.findFirst({
      where: { name: { contains: 'receivable', mode: 'insensitive' } },
    });
    if (!arAccount) {
      return res.status(400).json({
        error: 'No Accounts Receivable account found. Please create one with "receivable" in the name.',
      });
    }

    const amount = parseFloat(invoice.total.toString());

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          date: new Date(),
          description: `Payment received for Invoice ${invoice.invoiceNo}`,
          referenceNo: invoice.invoiceNo,
          status: 'POSTED',
          journalLines: {
            create: [
              { accountId: paymentAccountId, debit: amount, credit: 0 },
              { accountId: arAccount.id, debit: 0, credit: amount },
            ],
          },
        },
      });

      await tx.account.update({
        where: { id: paymentAccountId },
        data: { balance: { increment: amount } },
      });
      await tx.account.update({
        where: { id: arAccount.id },
        data: { balance: { decrement: amount } },
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: req.params.id },
        data: { status: 'PAID', journalEntryId: entry.id },
      });

      return { invoice: updatedInvoice, journalEntry: entry };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

router.post('/:id/void', async (req, res) => {
  try {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    if (existing.status === 'PAID') {
      return res.status(400).json({ error: 'Cannot void a paid invoice' });
    }
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'VOID' },
    });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to void invoice' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT invoices can be deleted' });
    }
    await prisma.invoice.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;
