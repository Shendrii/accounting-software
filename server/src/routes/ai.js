import express from 'express';
import OpenAI from 'openai';
import prisma from '../db/prisma.js';

const router = express.Router();

/**
 * POST /api/ai/chat
 * Body: { message: string }
 * Builds a financial snapshot from live DB and sends it as context to GPT-3.5.
 */
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'AI assistant is not configured. Set GROQ_API_KEY in your .env file.',
    });
  }

  try {
    // ── Build live financial context ─────────────────────────────────────
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start3Months = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const [
      cashAccounts,
      overdueInvoices,
      overdueBills,
      topVendors,
      topCustomers,
      thisMonthRevAgg,
      thisMonthExpAgg,
      lastMonthRevAgg,
      lastMonthExpAgg,
      pendingReceipts,
    ] = await Promise.all([
      prisma.account.findMany({
        where: { type: 'ASSET', isActive: true, name: { contains: 'cash', mode: 'insensitive' } },
        select: { name: true, balance: true },
      }),
      prisma.invoice.aggregate({
        where: { status: 'SENT', dueDate: { lt: now } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.bill.aggregate({
        where: { status: 'RECEIVED', dueDate: { lt: now } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.bill.groupBy({
        by: ['vendorId'],
        where: { status: { in: ['RECEIVED', 'PAID'] }, date: { gte: start3Months } },
        _sum: { total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
      prisma.invoice.groupBy({
        by: ['customerId'],
        where: { status: { in: ['SENT', 'PAID'] }, date: { gte: start3Months } },
        _sum: { total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
      prisma.journalLine.aggregate({
        where: { journalEntry: { status: 'POSTED', workspaceId: req.workspace.id, date: { gte: startOfMonth } }, account: { type: 'REVENUE' } },
        _sum: { credit: true },
      }),
      prisma.journalLine.aggregate({
        where: { journalEntry: { status: 'POSTED', workspaceId: req.workspace.id, date: { gte: startOfMonth } }, account: { type: 'EXPENSE' } },
        _sum: { debit: true },
      }),
      prisma.journalLine.aggregate({
        where: {
          journalEntry: {
            status: 'POSTED',
            workspaceId: req.workspace.id,
            date: { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), lt: startOfMonth },
          },
          account: { type: 'REVENUE' },
        },
        _sum: { credit: true },
      }),
      prisma.journalLine.aggregate({
        where: {
          journalEntry: {
            status: 'POSTED',
            workspaceId: req.workspace.id,
            date: { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), lt: startOfMonth },
          },
          account: { type: 'EXPENSE' },
        },
        _sum: { debit: true },
      }),
      prisma.receipt.count({ where: { status: 'PENDING' } }),
    ]);

    // Resolve vendor/customer names for top lists
    const vendorIds = topVendors.map((v) => v.vendorId);
    const customerIds = topCustomers.map((c) => c.customerId);
    const [vendorObjs, customerObjs, allCustomers, allVendors, recentInvoices, recentBills] = await Promise.all([
      prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }),
      prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } }),
      prisma.customer.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.vendor.findMany({
        where: { isActive: true },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { invoiceNo: true, status: true, total: true, date: true, dueDate: true, customer: { select: { name: true } } },
      }),
      prisma.bill.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { billNo: true, status: true, total: true, date: true, dueDate: true, vendor: { select: { name: true } } },
      }),
    ]);
    const vendorMap = Object.fromEntries(vendorObjs.map((v) => [v.id, v.name]));
    const customerMap = Object.fromEntries(customerObjs.map((c) => [c.id, c.name]));

    const totalCash = cashAccounts.reduce((s, a) => s + parseFloat(a.balance.toString()), 0);
    const thisMonthRev = parseFloat((thisMonthRevAgg._sum.credit ?? 0).toString());
    const thisMonthExp = parseFloat((thisMonthExpAgg._sum.debit ?? 0).toString());
    const lastMonthRev = parseFloat((lastMonthRevAgg._sum.credit ?? 0).toString());
    const lastMonthExp = parseFloat((lastMonthExpAgg._sum.debit ?? 0).toString());

    const fmt = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const context = `
You are an AI financial assistant embedded in an accounting application. Here is the current financial snapshot as of ${now.toDateString()}:

CASH & BANK:
- Total cash balance: ${fmt(totalCash)}
${cashAccounts.map((a) => `  • ${a.name}: ${fmt(a.balance)}`).join('\n')}

THIS MONTH (${now.toLocaleString('default', { month: 'long', year: 'numeric' })}):
- Revenue: ${fmt(thisMonthRev)}
- Expenses: ${fmt(thisMonthExp)}
- Net Income: ${fmt(thisMonthRev - thisMonthExp)}

LAST MONTH:
- Revenue: ${fmt(lastMonthRev)}
- Expenses: ${fmt(lastMonthExp)}
- Net Income: ${fmt(lastMonthRev - lastMonthExp)}

RECEIVABLES (overdue invoices):
- Count: ${overdueInvoices._count}
- Total: ${fmt(overdueInvoices._sum.total ?? 0)}

PAYABLES (overdue bills):
- Count: ${overdueBills._count}
- Total: ${fmt(overdueBills._sum.total ?? 0)}

TOP 5 VENDORS (last 3 months by spend):
${topVendors.map((v, i) => `${i + 1}. ${vendorMap[v.vendorId] ?? 'Unknown'}: ${fmt(v._sum.total ?? 0)}`).join('\n')}

TOP 5 CUSTOMERS (last 3 months by revenue):
${topCustomers.length ? topCustomers.map((c, i) => `${i + 1}. ${customerMap[c.customerId] ?? 'Unknown'}: ${fmt(c._sum.total ?? 0)}`).join('\n') : 'None'}

ALL ACTIVE CUSTOMERS (most recently added first):
${allCustomers.length ? allCustomers.map((c, i) => `${i + 1}. ${c.name}${c.email ? ` <${c.email}>` : ''} — added ${new Date(c.createdAt).toLocaleDateString()}`).join('\n') : 'No customers yet'}

ALL ACTIVE VENDORS (most recently added first):
${allVendors.length ? allVendors.map((v, i) => `${i + 1}. ${v.name} — added ${new Date(v.createdAt).toLocaleDateString()}`).join('\n') : 'No vendors yet'}

RECENT INVOICES (last 10):
${recentInvoices.length ? recentInvoices.map((inv) => `- ${inv.invoiceNo} | ${inv.customer?.name ?? 'Unknown'} | ${inv.status} | ${fmt(inv.total)} | ${new Date(inv.date).toLocaleDateString()}`).join('\n') : 'No invoices'}

RECENT BILLS (last 10):
${recentBills.length ? recentBills.map((b) => `- ${b.billNo} | ${b.vendor?.name ?? 'Unknown'} | ${b.status} | ${fmt(b.total)} | ${new Date(b.date).toLocaleDateString()}`).join('\n') : 'No bills'}

PENDING RECEIPTS: ${pendingReceipts}

Answer the user's question concisely and accurately based on the data above. You have access to specific customer names, vendor names, invoice details, and bill details — use them. Never make up numbers or names.
`.trim();

    const openai = new OpenAI({
      apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.GROQ_API_KEY ? 'https://api.groq.com/openai/v1' : undefined,
    });
    const completion = await openai.chat.completions.create({
      model: process.env.GROQ_API_KEY ? 'llama-3.1-8b-instant' : 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: context },
        { role: 'user', content: message },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    const reply = completion.choices[0]?.message?.content ?? 'I could not generate a response.';
    res.json({ reply });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'AI assistant encountered an error. Please try again.' });
  }
});

export default router;
