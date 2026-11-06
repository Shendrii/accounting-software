import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import prisma from '../db/prisma.js';
import { parseReceiptWithGPT } from '../lib/parseReceipt.js';
import { isAllowedReceiptImage, receiptImageToJpeg } from '../lib/receiptImage.js';
import { LedgerError, createPosting, decimalInput, ledgerAccounts, ledgerDate, ledgerTransaction, sendLedgerError } from '../lib/ledger.js';

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

const receiptDetail = {
  journalEntry: { include: { journalLines: { include: { account: true } } } },
  vendor: { select: { id: true, name: true } },
  bill: { select: { id: true, billNo: true } },
};

const receiptWhere = req => ({ id: req.params.id, workspaceId: req.workspace.id });

async function getReceipt(tx, where) {
  const receipt = await tx.receipt.findFirst({ where, include: receiptDetail });
  if (!receipt) throw new LedgerError('Receipt not found.', 404);
  return receipt;
}

function receiptDate(data) {
  return ledgerDate(data?.invoiceDate || data?.date, 'Confirmed receipt date');
}

// Save review details without posting or recording a payment.
router.put('/:id', async (req, res) => {
  try {
    const where = receiptWhere(req);
    const { extractedData, status, vendorId, category, billId } = req.body;
    const receipt = await ledgerTransaction(async tx => {
      const current = await getReceipt(tx, where);
      if (status !== undefined) throw new LedgerError('Use the receipt review actions to change status.');
      if (current.status !== 'PENDING' && (extractedData !== undefined || billId !== undefined)) {
        throw new LedgerError('Reviewed receipt amounts, dates, and bill links are read-only.', 409);
      }
      if (vendorId && (typeof vendorId !== 'string' || !await tx.vendor.findFirst({
        where: { id: vendorId, workspaceId: where.workspaceId }, select: { id: true },
      }))) throw new LedgerError('Choose a vendor from this workspace.');
      if (billId && (typeof billId !== 'string' || !await tx.bill.findFirst({
        where: { id: billId, workspaceId: where.workspaceId }, select: { id: true },
      }))) throw new LedgerError('Choose a bill from this workspace.');
      if (extractedData !== undefined) {
        if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) throw new LedgerError('Enter valid receipt details.');
        const date = receiptDate(extractedData).toISOString().slice(0, 10);
        extractedData.invoiceDate = date;
        extractedData.date = date;
      }
      return tx.receipt.update({
        where, include: receiptDetail,
        data: {
          extractedData,
          ...(vendorId !== undefined && { vendorId: vendorId || null }),
          ...(category !== undefined && { category: category || null }),
          ...(billId !== undefined && { billId: billId || null }),
        },
      });
    });
    res.json(receipt);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to save receipt details.');
  }
});

router.post('/:id/attach-to-bill', async (req, res) => {
  try {
    const where = receiptWhere(req);
    const { billId, vendorId, category } = req.body;
    const receipt = await ledgerTransaction(async tx => {
      const current = await getReceipt(tx, where);
      if (current.status === 'APPROVED' && current.billId && current.billId === billId && !current.journalEntryId) return current;
      if (current.status !== 'PENDING' || current.journalEntryId) throw new LedgerError('Only receipts awaiting review can be attached.', 409);
      receiptDate(current.extractedData);
      if (typeof billId !== 'string' || !billId) throw new LedgerError('Select a posted bill.');
      if (category != null && typeof category !== 'string') throw new LedgerError('Enter a valid receipt category.');
      const bill = await tx.bill.findFirst({
        where: { id: billId, workspaceId: where.workspaceId, OR: [{ status: 'PAID' }, { status: 'RECEIVED', postingEntryId: { not: null } }] },
        select: { id: true, vendorId: true },
      });
      if (!bill) throw new LedgerError('Select a posted bill from this workspace.');
      const expectedVendor = vendorId === undefined ? current.vendorId : vendorId;
      if (expectedVendor && expectedVendor !== bill.vendorId) throw new LedgerError('Choose a bill for the receipt vendor.');
      return tx.receipt.update({ where, data: { billId: bill.id, vendorId: bill.vendorId, category, status: 'APPROVED' }, include: receiptDetail });
    });
    res.json(receipt);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to attach the receipt.');
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const where = receiptWhere(req);
    const { expenseAccountId, paymentAccountId } = req.body;
    const result = await ledgerTransaction(async tx => {
      const current = await getReceipt(tx, where);
      if (current.billId) throw new LedgerError('Attach this receipt as evidence and record the bill payment in Purchases.', 409);
      if (current.status === 'APPROVED' && current.journalEntry) {
        const lines = current.journalEntry.journalLines;
        if (lines.some(line => line.accountId === expenseAccountId && line.debit.gt(0)) &&
            lines.some(line => line.accountId === paymentAccountId && line.credit.gt(0))) {
          return { receipt: current, journalEntry: current.journalEntry };
        }
      }
      if (current.status !== 'PENDING') throw new LedgerError('This receipt has already been reviewed.', 409);
      const data = current.extractedData;
      const date = receiptDate(data);
      const amount = decimalInput(data?.amount ?? data?.total ?? data?.amountPaid, 'Receipt amount');
      if (amount.isZero()) throw new LedgerError('Confirm a positive receipt amount before posting.');
      const accounts = await ledgerAccounts(tx, where.workspaceId, [expenseAccountId, paymentAccountId]);
      if (accounts.get(expenseAccountId).type !== 'EXPENSE' ||
          !['ASSET', 'LIABILITY'].includes(accounts.get(paymentAccountId).type)) {
        throw new LedgerError('Choose an expense account and a cash or credit account.');
      }
      const journalEntry = await createPosting(tx, where.workspaceId, {
        date, description: data?.vendor ? 'Receipt: ' + data.vendor : 'Receipt ' + current.id.slice(0, 8),
        referenceNo: data?.invoiceNumber || data?.vendor || null,
        lines: [{ accountId: expenseAccountId, debit: amount }, { accountId: paymentAccountId, credit: amount }],
      });
      const receipt = await tx.receipt.update({
        where, data: { status: 'APPROVED', journalEntryId: journalEntry.id }, include: receiptDetail,
      });
      return { receipt, journalEntry };
    });
    res.json(result);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to post the receipt expense.');
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const where = receiptWhere(req);
    const receipt = await ledgerTransaction(async tx => {
      const current = await getReceipt(tx, where);
      if (current.status === 'REJECTED') return current;
      if (current.status !== 'PENDING') throw new LedgerError('This receipt has already been reviewed.', 409);
      return tx.receipt.update({ where, data: { status: 'REJECTED' }, include: receiptDetail });
    });
    res.json(receipt);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to reject the receipt.');
  }
});

export default router;
