import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { search, isActive } = req.query;
    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      include: {
        invoices: { orderBy: { date: 'desc' }, take: 10 },
      },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, address, city, country } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const customer = await prisma.customer.create({
      data: { name, email, phone, address, city, country },
    });
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, address, city, country, isActive } = req.body;
    const customer = await prisma.customer.update({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      data: { name, email, phone, address, city, country, isActive },
    });
    res.json(customer);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Customer not found' });
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const hasPostedInvoices = await prisma.invoice.findFirst({
      where: { customerId: req.params.id, status: { in: ['SENT', 'PAID'] } },
    });
    if (hasPostedInvoices) {
      return res.status(400).json({ error: 'Cannot delete customer with sent or paid invoices' });
    }

    await prisma.customer.update({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      data: { isActive: false },
    });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Customer not found' });
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

export default router;
