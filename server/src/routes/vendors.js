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
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const vendors = await prisma.vendor.findMany({ where, orderBy: { name: 'asc' } });
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      include: { bills: { orderBy: { date: 'desc' }, take: 10 } },
    });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const vendor = await prisma.vendor.create({ data: { name, email, phone, address } });
    res.status(201).json(vendor);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, address, isActive } = req.body;
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      data: { name, email, phone, address, isActive },
    });
    res.json(vendor);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Vendor not found' });
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const hasPaidBills = await prisma.bill.findFirst({
      where: { vendorId: req.params.id, status: { in: ['RECEIVED', 'PAID'] } },
    });
    if (hasPaidBills) {
      return res.status(400).json({ error: 'Cannot delete vendor with received or paid bills' });
    }
    await prisma.vendor.update({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      data: { isActive: false },
    });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Vendor not found' });
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

export default router;
