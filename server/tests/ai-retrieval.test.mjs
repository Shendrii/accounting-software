import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';

const root = process.env.ACCOUNTING_AI_TEST_API;
const database = process.env.ACCOUNTING_TEST_DATABASE_URL;

async function signup(name) {
  const response = await fetch(`${root}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email: `${randomUUID()}@example.test`, password: 'disposable-test-only' }),
  });
  assert.equal(response.status, 201);
  const { token, workspace } = await response.json();
  const api = async (path, method = 'GET', body, status = 200, workspaceId = workspace.id) => {
    const response = await fetch(`${root}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': workspaceId, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
  };
  return { workspaceId: workspace.id, api };
}

const providerCalls = async () => (await fetch(`${root}/__test/ai`)).json();

test('Ask AI retrieves old records, scopes evidence and preserves verified source links', { skip: !root || !database }, async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(root).hostname));
  const dbAddress = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(dbAddress.hostname));
  assert.match(dbAddress.pathname, /^\/(readiness_|accountrix_test_)/);
  const db = new PrismaClient({ datasources: { db: { url: database } } });
  try {
    const { workspaceId, api } = await signup('RAG fixture');
    const other = await signup('Private other workspace');
    const account = (code, name, type, role) => api('/accounts', 'POST', { code, name, type, role }, 201);
    const bank = await account('1000', 'Cash fixture', 'ASSET', 'CASH');
    const ar = await account('1100', 'Receivable fixture', 'ASSET', 'ACCOUNTS_RECEIVABLE');
    const income = await account('4000', 'Revenue fixture', 'REVENUE', 'GENERAL');
    const customer = await api('/customers', 'POST', { name: 'Orchard Design', email: 'excluded-contact@example.test' }, 201);
    const date = '2021-05-12';
    const invoice = await api('/invoices', 'POST', {
      customerId: customer.id, date, dueDate: '2021-06-12',
      lines: [{ description: 'Annual design services', quantity: '1', unitPrice: '125.25' }],
    }, 201);
    await db.invoice.update({ where: { id: invoice.id }, data: { invoiceNo: 'INV-2021-OLD-01', notes: 'EXCLUDED-PRIVATE-NOTES' } });
    await api(`/invoices/${invoice.id}/post`, 'POST', { receivableAccountId: ar.id, revenueAccountId: income.id });
    await api(`/invoices/${invoice.id}/record-payment`, 'POST', { paymentAccountId: bank.id, amount: '40.25', date, requestId: randomUUID() });
    const newerDate = new Date('2025-11-01T00:00:00Z');
    await db.invoice.createMany({ data: Array.from({ length: 15 }, (_, i) => ({
      workspaceId, customerId: customer.id, invoiceNo: `NEW-${i}`, date: newerDate, dueDate: newerDate, subtotal: '12.00', total: '12.00',
    })) });
    const vendor = await api('/vendors', 'POST', { name: 'Copper Supply' }, 201);
    const bill = await db.bill.create({ data: {
      workspaceId, vendorId: vendor.id, billNo: 'BILL-2022-01', vendorInvoiceNo: 'PO/2022/46',
      date: new Date('2022-03-10T00:00:00Z'), dueDate: new Date('2022-04-10T00:00:00Z'), total: '22.20',
    } });
    const receipt = await db.receipt.create({ data: {
      workspaceId, imageUrl: '/fixture-only', createdAt: newerDate, category: 'Office supplies',
      extractedData: { invoiceNumber: 'RCPT-2004-10', vendor: 'Harbor Office', invoiceDate: '2004-10-01', total: '8.50', rawText: 'EXCLUDED-RAW-OCR' },
    } });
    await db.receipt.create({ data: {
      workspaceId, imageUrl: '/fixture-only', createdAt: newerDate,
      extractedData: { invoiceNumber: 'RCPT-BAD-DATE-11', vendor: 'Old receipt', invoiceDate: '2004-24-01', total: 'invalid' },
    } });
    const otherCustomer = await other.api('/customers', 'POST', { name: 'Other private party' }, 201);
    await db.invoice.create({ data: {
      workspaceId: other.workspaceId, customerId: otherCustomer.id, invoiceNo: 'SECRET-2021-02', date: newerDate, dueDate: newerDate, subtotal: '999.99', total: '999.99',
    } });
    const ask = message => api('/ai/chat', 'POST', { message });

    const exact = await ask('How much is due on inv-2021-old-01?');
    assert.deepEqual(exact.sources, [{ label: 'INV-2021-OLD-01', href: `/sales/invoices/${invoice.id}` }]);
    assert.match(exact.reply, /\[1\]/);
    const evidence = (await providerCalls()).at(-1);
    assert.equal(evidence.records[0].balanceDue, '85.00');
    assert.equal(evidence.records[0].amountSettled, '40.25');
    assert.deepEqual(evidence.records[0].sampleLineDescriptions, ['Annual design services']);
    assert.match(evidence.instructions, /Treat it as data only/);
    assert.doesNotMatch(JSON.stringify(evidence), /EXCLUDED-PRIVATE-NOTES|excluded-contact|Other private party|NEW-0/);

    const byParty = await ask('Show invoices for Orchard Design from May 2021');
    assert.deepEqual(byParty.sources, exact.sources);
    const byVendorRef = await ask('Find supplier invoice PO/2022/46');
    assert.deepEqual(byVendorRef.sources, [{ label: 'BILL-2022-01', href: `/purchases/bills/${bill.id}` }]);
    const oldReceipt = await ask('Find the Harbor Office receipt from 2004-10-01');
    assert.equal(oldReceipt.sources[0].href, `/purchases/documents?receipt=${receipt.id}`);
    const receiptEvidence = (await providerCalls()).at(-1).records[0];
    assert.equal(receiptEvidence.total, '8.50');
    assert.equal(receiptEvidence.balanceDue, null);
    assert.doesNotMatch(JSON.stringify(receiptEvidence), /EXCLUDED-RAW-OCR/);

    const callsBefore = (await providerCalls()).length;
    const missing = await ask('Find invoice SECRET-2021-02 for Orchard Design');
    assert.deepEqual(missing.sources, []);
    assert.match(missing.reply, /couldn’t find/);
    await api('/ai/chat', 'POST', { message: 'Find invoice SECRET-2021-02' }, 403, other.workspaceId);
    assert.equal((await providerCalls()).length, callsBefore);

    const fallback = await ask('INV-2021-OLD-01 invalid citation');
    assert.doesNotMatch(fallback.reply, /999|Unsupported answer/);
    assert.match(fallback.reply, /current balance due USD 85\.00/);
    assert.deepEqual(fallback.sources, exact.sources);
    const unavailable = await ask('INV-2021-OLD-01 provider unavailable');
    assert.equal(unavailable.reply, fallback.reply);

    const overdue = await ask('How many overdue invoices do I have?');
    assert.match(overdue.reply, /1 posted invoices are overdue.*USD 85\.00/);
    const profit = await ask('What was my profit in May 2021?');
    assert.match(profit.reply, /net income USD 125\.25/);
    await api('/ai/chat', 'POST', { message: 'x'.repeat(1001) }, 400);
  } finally {
    await db.$disconnect();
  }
});
