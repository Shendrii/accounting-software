import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { parseRecordQuestion, retrieveRecords } from '../src/lib/aiRetrieval.js';
import { embeddingModelVersion } from '../src/lib/aiEmbeddings.js';

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

function disposableDatabase() {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(root).hostname));
  const dbAddress = new URL(database);
  assert.ok(['127.0.0.1', 'localhost'].includes(dbAddress.hostname));
  assert.match(dbAddress.pathname, /^\/(readiness_|accountrix_test_)/);
  return new PrismaClient({ datasources: { db: { url: database } } });
}

test('Ask AI retrieves old records, scopes evidence and preserves verified source links', { skip: !root || !database }, async () => {
  const db = disposableDatabase();
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
    const oldReceipt = await ask('Find the Harbor Office receipt RCPT-2004-10 from 2004-10-01');
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

    const invoicePassage = await waitForPassage(db, workspaceId, 'invoice', invoice.id, 'Annual design services');
    assert.match(invoicePassage, /Orchard Design/);
    const receiptPassage = await waitForPassage(db, workspaceId, 'receipt', receipt.id, 'EXCLUDED-RAW-OCR');
    assert.match(receiptPassage, /Harbor Office/);
  } finally {
    await db.$disconnect();
  }
});

async function waitForPassage(db, workspaceId, sourceType, sourceId, text) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const [row] = await db.$queryRaw`
      SELECT passage, "embeddingModel", vector_dims(embedding) AS dimensions FROM "AiDocumentEmbedding"
      WHERE "workspaceId" = ${workspaceId} AND "sourceType" = ${sourceType} AND "sourceId" = ${sourceId}
    `;
    if (row?.passage?.includes(text) && row.dimensions === 384) {
      assert.equal(row.embeddingModel, embeddingModelVersion);
      return row.passage;
    }
    await delay(100);
  }
  assert.fail(`No 384-dimensional ${sourceType} passage containing ${text}`);
}

test('Semantic Ask AI cites the March 2022 Copper Supply hosting bill only in its workspace', { skip: !root || !database }, async () => {
  const db = disposableDatabase();
  try {
    const { api, workspaceId } = await signup('Semantic hosting fixture');
    const other = await api('/workspaces', 'POST', { name: `Other semantic workspace ${randomUUID()}` }, 201);
    const vendor = await api('/vendors', 'POST', { name: 'Copper Supply' }, 201);
    const account = (code, name, type, role) => api('/accounts', 'POST', { code, name, type, role }, 201);
    const expense = await account('5100', 'Operating expense', 'EXPENSE', 'GENERAL');
    await account('2100', 'Trade payable', 'LIABILITY', 'ACCOUNTS_PAYABLE');
    const bank = await account('1000', 'Cash fixture', 'ASSET', 'CASH');
    const line = description => ({ description, quantity: '1', unitPrice: '22.20', accountId: expense.id });
    const draft = await api('/bills', 'POST', {
      vendorId: vendor.id, vendorInvoiceNo: 'PO-2022-46', date: '2022-03-10', dueDate: '2022-04-10',
      lines: [line('Original description')],
    }, 201);
    await waitForPassage(db, workspaceId, 'bill', draft.id, 'Original description');
    const bill = await api(`/bills/${draft.id}`, 'PUT', { lines: [line('monthly hosting for the website')] });
    const passage = await waitForPassage(db, workspaceId, 'bill', bill.id, 'monthly hosting for the website');
    assert.match(passage, /Copper Supply/);
    assert.match(passage, /2022-03-10/);
    assert.doesNotMatch(passage, /Original description/);
    await api(`/bills/${bill.id}/receive`, 'POST', {});
    await api(`/bills/${bill.id}/pay`, 'POST', {
      paymentAccountId: bank.id, amount: '22.20', date: '2022-03-15', requestId: randomUUID(),
    });
    assert.doesNotMatch([vendor.name, bill.billNo, bill.vendorInvoiceNo, expense.name].join(' '), /hosting/i);
    const question = 'What did we pay for website hosting in March 2022?';
    assert.deepEqual(await retrieveRecords(db, workspaceId, parseRecordQuestion(question)), []);

    const response = await api('/ai/chat', 'POST', { message: question });
    assert.deepEqual(response.sources, [{ label: bill.billNo, href: `/purchases/bills/${bill.id}` }]);
    assert.match(response.reply, /\[1\]/);
    const call = (await providerCalls()).findLast(call => call.question === question);
    assert.equal(call.records[0].source, 1);
    assert.equal(call.records[0].passage, passage);
    assert.equal(call.records[0].amountSettled, '22.20');
    const callCount = (await providerCalls()).length;

    const isolated = await api('/ai/chat', 'POST', { message: question }, 200, other.id);
    assert.deepEqual(isolated.sources, []);
    assert.doesNotMatch(isolated.reply, /Copper Supply|\[1\]/);
    assert.equal((await providerCalls()).length, callCount);
  } finally {
    await db.$disconnect();
  }
});
