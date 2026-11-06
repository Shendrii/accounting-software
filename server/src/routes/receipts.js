import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import prisma from '../db/prisma.js';
import { parseReceiptWithGPT } from '../lib/parseReceipt.js';
import { isAllowedReceiptImage, receiptImageToJpeg } from '../lib/receiptImage.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (isAllowedReceiptImage(file.mimetype, file.originalname)) {
      cb(null, true);
      return;
    }
    cb(new Error('Upload a JPEG, PNG, or WebP image'));
  },
});

const router = express.Router();
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:5001';

async function extractTextFromImage(jpeg) {
  let lastError = new Error('OCR failed');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const formData = new FormData();
    formData.append('image', new Blob([jpeg], { type: 'image/jpeg' }), 'receipt.jpg');
    const response = await fetch(`${OCR_SERVICE_URL}/extract`, {
      method: 'POST',
      body: formData,
    });
    if (response.ok) {
      const data = await response.json();
      return data.text || '';
    }
    const err = await response.json().catch(() => ({}));
    lastError = new Error(err.error || `OCR failed: ${response.status}`);
    if (response.status !== 429 || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw lastError;
}

function uploadImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const message = err.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
    next();
  });
}

async function legacyImage(imageUrl) {
  if (!/^\/uploads\/receipt-[\w-]+\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(imageUrl)) return null;
  return receiptImageToJpeg(fileURLToPath(new URL(`../..${imageUrl}`, import.meta.url))).catch(() => null);
}

// POST /api/receipts/upload - upload image, OCR + GPT, create receipt
router.post('/upload', uploadImage, async (req, res) => {
  try {
    const jpeg = await receiptImageToJpeg(req.file.buffer).catch(() => null);
    if (!jpeg) return res.status(400).json({ error: 'Could not read this image. Try a JPEG, PNG, or WebP file.' });

    let ocrText = '';
    try {
      ocrText = await extractTextFromImage(jpeg);
    } catch (err) {
      return res.status(502).json({ error: `OCR failed: ${err.message}` });
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
        imageUrl: '',
        workspaceId: req.workspace.id,
        extractedData,
        status: 'PENDING',
        image: { create: { jpeg } },
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

router.get('/pending-count', async (req, res) => {
  try {
    const count = await prisma.receipt.count({ where: { workspaceId: req.workspace.id, status: 'PENDING' } });
    res.json({ count });
  } catch (error) {
    console.error('[receipt count]', error);
    res.status(500).json({ error: 'Could not count pending receipts' });
  }
});

router.get('/:id/image', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      select: { imageUrl: true, image: { select: { jpeg: true } } },
    });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    const jpeg = receipt.image?.jpeg ?? await legacyImage(receipt.imageUrl);
    if (!jpeg) return res.status(404).json({ error: 'Receipt image is no longer available' });
    res.type('jpeg').send(Buffer.from(jpeg));
  } catch (error) {
    console.error('[receipt image]', error);
    res.status(500).json({ error: 'Could not load receipt image' });
  }
});

router.post('/:id/image', uploadImage, async (req, res) => {
  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: req.params.id, workspaceId: req.workspace.id },
      select: { id: true, imageUrl: true, image: { select: { receiptId: true } } },
    });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (receipt.image || await legacyImage(receipt.imageUrl)) return res.status(409).json({ error: 'This receipt already has an image' });
    const jpeg = await receiptImageToJpeg(req.file.buffer).catch(() => null);
    if (!jpeg) return res.status(400).json({ error: 'Could not read this image. Try a JPEG, PNG, or WebP file.' });
    await prisma.receiptImage.create({ data: { receiptId: receipt.id, jpeg } });
    res.status(204).end();
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'This receipt already has an image' });
    console.error('[attach receipt image]', error);
    res.status(500).json({ error: 'Could not attach receipt image' });
  }
});

// GET /api/receipts/:id
router.get('/:id', async (req, res) => {
  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: req.params.id, workspaceId: req.workspace.id },
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
    const receipt = await prisma.receipt.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (receipt.status === 'APPROVED') {
      return res.status(400).json({ error: 'Receipt already approved' });
    }

    // If the receipt is linked to a bill, mark the bill as PAID instead
    if (receipt.billId) {
      const bill = await prisma.bill.findFirst({ where: { id: receipt.billId, workspaceId: req.workspace.id } });
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
