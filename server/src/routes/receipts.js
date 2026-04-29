import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import prisma from '../db/prisma.js';
import { parseReceiptWithGPT } from '../lib/parseReceipt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `receipt-${unique}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

const router = express.Router();
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:5000';

async function extractTextFromImage(filePath) {
  const buffer = await readFile(filePath);
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const formData = new FormData();
  formData.append('image', blob, path.basename(filePath));
  const response = await fetch(`${OCR_SERVICE_URL}/extract`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `OCR failed: ${response.status}`);
  }
  const data = await response.json();
  return data.text || '';
}

// POST /api/receipts/upload - upload image, OCR + GPT, create receipt
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const filePath = req.file.path;
    const imageUrl = `/uploads/${req.file.filename}`;

    let ocrText = '';
    let ocrError = null;
    try {
      ocrText = await extractTextFromImage(filePath);
    } catch (err) {
      // Do not block uploads when OCR provider is unavailable/unauthorized.
      // Users can still review/edit fields manually in the receipt UI.
      ocrError = err?.message || 'OCR unavailable';
      console.error('OCR error during upload:', ocrError);
    }

    let extractedData = {
      vendor: '',
      invoiceDate: '',
      dueDate: '',
      invoiceNumber: '',
      total: 0,
      amountPaid: 0,
      balanceDue: 0,
      items: [],
      category: '',
      confidence: 0,
      rawText: ocrText,
      ocrError,
    };
    if (ocrText.trim()) {
      try {
        const parsed = await parseReceiptWithGPT(ocrText);
        if (parsed) {
          extractedData = { ...extractedData, ...parsed };
        }
        // Always set amount/date for journal entry (from total/invoiceDate or fallback)
        const amount = extractedData.total ?? extractedData.balanceDue ?? extractedData.amountPaid ?? 0;
        const date = extractedData.invoiceDate || extractedData.dueDate || '';
        extractedData.amount = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
        extractedData.date = date;
      } catch (err) {
        console.error('Parse error:', err.message);
      }
    }

    const receipt = await prisma.receipt.create({
      data: {
        imageUrl,
        extractedData,
        status: 'PENDING',
      },
    });
    res.status(201).json(receipt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/receipts - list receipts (optional ?status=)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const receipts = await prisma.receipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        journalEntry: { include: { journalLines: { include: { account: true } } } },
        vendor: { select: { id: true, name: true } },
        bill: { select: { id: true, billNo: true } },
      },
    });
    res.json(receipts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/receipts/:id
router.get('/:id', async (req, res) => {
  try {
    const receipt = await prisma.receipt.findUnique({
      where: { id: req.params.id },
      include: {
        journalEntry: { include: { journalLines: { include: { account: true } } } },
        vendor: { select: { id: true, name: true } },
        bill: { select: { id: true, billNo: true } },
      },
    });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    res.json(receipt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/receipts/:id - update extractedData, status, vendor, category, bill
router.put('/:id', async (req, res) => {
  try {
    const { extractedData, status, vendorId, category, billId } = req.body;
    const update = {};
    if (extractedData != null) update.extractedData = extractedData;
    if (status != null) update.status = status;
    if (vendorId !== undefined) update.vendorId = vendorId || null;
    if (category !== undefined) update.category = category || null;
    if (billId !== undefined) update.billId = billId || null;

    const receipt = await prisma.receipt.update({
      where: { id: req.params.id },
      data: update,
      include: {
        journalEntry: { include: { journalLines: { include: { account: true } } } },
        vendor: { select: { id: true, name: true } },
        bill: { select: { id: true, billNo: true } },
      },
    });
    res.json(receipt);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Receipt not found' });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/receipts/:id/approve - create journal entry (debit expense, credit payment), link receipt
router.post('/:id/approve', async (req, res) => {
  try {
    const { expenseAccountId, paymentAccountId } = req.body;
    if (!expenseAccountId || !paymentAccountId) {
      return res.status(400).json({ error: 'expenseAccountId and paymentAccountId are required' });
    }
    const receipt = await prisma.receipt.findUnique({ where: { id: req.params.id } });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (receipt.status === 'APPROVED') {
      return res.status(400).json({ error: 'Receipt already approved' });
    }

    // If the receipt is linked to a bill, mark the bill as PAID instead
    if (receipt.billId) {
      const bill = await prisma.bill.findUnique({ where: { id: receipt.billId } });
      if (bill && bill.status === 'RECEIVED') {
        const apAccount = await prisma.account.findFirst({
          where: { name: { contains: 'payable', mode: 'insensitive' } },
        });
        if (!apAccount) {
          return res.status(400).json({ error: 'No Accounts Payable account found.' });
        }
        const amount = parseFloat(bill.total.toString());
        await prisma.$transaction(async (tx) => {
          const entry = await tx.journalEntry.create({
            data: {
              date: new Date(),
              description: `Payment for Bill ${bill.billNo} via receipt`,
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
          await tx.account.update({ where: { id: apAccount.id }, data: { balance: { decrement: amount } } });
          await tx.account.update({ where: { id: paymentAccountId }, data: { balance: { decrement: amount } } });
          await tx.bill.update({ where: { id: bill.id }, data: { status: 'PAID', journalEntryId: entry.id } });
          await tx.receipt.update({ where: { id: receipt.id }, data: { status: 'APPROVED' } });
        });
        const updatedReceipt = await prisma.receipt.findUnique({
          where: { id: req.params.id },
          include: { vendor: { select: { id: true, name: true } }, bill: { select: { id: true, billNo: true } } },
        });
        return res.json({ receipt: updatedReceipt });
      }
    }

    const data = receipt.extractedData;
    const parsedAmount = parseFloat(data?.amount ?? data?.total ?? data?.balanceDue ?? data?.amountPaid);
    const amount =
      (typeof data?.amount === 'number' ? data.amount : null) ??
      (typeof data?.total === 'number' ? data.total : null) ??
      (typeof data?.balanceDue === 'number' ? data.balanceDue : null) ??
      (typeof data?.amountPaid === 'number' ? data.amountPaid : null) ??
      (isNaN(parsedAmount) ? 0 : parsedAmount);
    if (amount <= 0) {
      return res.status(400).json({ error: 'Invalid or missing amount in receipt data' });
    }
    const dateStr = data?.date || data?.invoiceDate || data?.dueDate;
    const date = dateStr ? new Date(dateStr) : new Date();
    const description = data?.vendor
      ? (data?.invoiceNumber ? `Invoice ${data.invoiceNumber}: ${data.vendor}` : `Receipt: ${data.vendor}`)
      : `Receipt ${receipt.id.slice(0, 8)}`;

    const journalEntry = await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          date,
          description,
          referenceNo: data?.invoiceNumber || data?.vendor || null,
          status: 'POSTED',
          journalLines: {
            create: [
              { accountId: expenseAccountId, debit: amount, credit: 0 },
              { accountId: paymentAccountId, debit: 0, credit: amount },
            ],
          },
        },
        include: { journalLines: { include: { account: true } } },
      });
      await tx.receipt.update({
        where: { id: receipt.id },
        data: { status: 'APPROVED', journalEntryId: entry.id },
      });
      await tx.account.update({
        where: { id: expenseAccountId },
        data: { balance: { increment: amount } },
      });
      await tx.account.update({
        where: { id: paymentAccountId },
        data: { balance: { decrement: amount } },
      });
      return entry;
    });

    const updatedReceipt = await prisma.receipt.findUnique({
      where: { id: req.params.id },
      include: { journalEntry: { include: { journalLines: { include: { account: true } } } } },
    });
    res.json({ receipt: updatedReceipt, journalEntry });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Receipt not found' });
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/receipts/:id/reject
router.post('/:id/reject', async (req, res) => {
  try {
    const receipt = await prisma.receipt.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
      include: { journalEntry: true },
    });
    res.json(receipt);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Receipt not found' });
    res.status(500).json({ error: error.message });
  }
});

export default router;
