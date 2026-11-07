import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const root = process.env.ACCOUNTING_TEST_API;
const options = { skip: !root && 'Set ACCOUNTING_TEST_API to a disposable localhost backend.' };
async function fixture() {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(root).hostname));
  const response = await fetch(root + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Books fixture', email: randomUUID() + '@example.test', password: 'disposable-test-only' }) });
  assert.equal(response.status, 201);
  const session = await response.json();
  const api = async (path, method = 'GET', body, status = 200, workspaceId = session.workspace.id) => {
    const response = await fetch(root + '/api' + path, { method,
      headers: { Authorization: 'Bearer ' + session.token, 'x-workspace-id': workspaceId, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, method + ' ' + path + ': ' + JSON.stringify(data));
    return data;
  };
  const profile = { legalName: 'Fixture business', country: 'PH', currency: 'PHP', entityType: 'SOLE_PROPRIETOR', fiscalYearStartMonth: 1,
    booksStartDate: '2026-02-01', accountingBasis: 'ACCRUAL', taxSettings: { vatStatus: 'NON_VAT', withholdingAgent: false }, createChart: true };
  const setup = overrides => api('/workspace-settings', 'PUT', { ...profile, ...overrides });
  return { api, setup, profile, session };
}

test('PH and US setup preserves existing currency, validates registrations and scopes every write', options, async () => {
  const a = await fixture(); const b = await fixture();
  const ph = await a.setup(); assert.equal(ph.currency, 'PHP'); assert.equal(ph.country, 'PH');
  const usInput = { country: 'US', currency: 'USD', region: 'CA', entityType: 'LLC', taxSettings: { salesTaxRegistered: true, salesTaxJurisdictions: 'CA', contractorTracking: true } };
  const us = await b.setup(usInput); assert.equal(us.country, 'US'); assert.equal(us.region, 'CA'); assert.equal(us.name, 'Fixture business');
  await b.api('/workspace-settings/opening-balances', 'POST', { requestId: randomUUID() }, 201);
  assert.equal((await b.api('/workspace-settings')).currencyLocked, true);
  await b.api('/workspace-settings', 'PUT', { ...b.profile, ...usInput, currency: 'PHP', createChart: false }, 409);
  await a.api('/workspace-settings', 'PUT', { ...a.profile }, 403, b.session.workspace.id);
  await a.api('/workspace-settings', 'PUT', { ...a.profile, accountingBasis: 'CASH', createChart: false }, 400);
  const accounts = await a.api('/accounts');
  const bank = accounts.find(row => row.role === 'BANK'); const equity = accounts.find(row => row.code === '3000');
  await a.api('/journal-entries', 'POST', { date: '2026-02-01', description: 'Existing draft', journalLines: [{ accountId: bank.id, debit: '5' }, { accountId: equity.id, credit: '5' }] }, 201);
  await a.api('/workspace-settings', 'PUT', { ...a.profile, currency: 'USD', createChart: false }, 409);
  assert.equal((await a.api('/workspace-settings')).currency, 'PHP');
  const customer = await a.api('/customers', 'POST', { name: 'Private customer' }, 201);
  await b.api('/customers/' + customer.id, 'PUT', { name: 'Cross-tenant mutation' }, 404);
});

const opening = () => ({ requestId: randomUUID(),
  balances: [
    { accountCode: '1010', debit: '1000', credit: '0' }, { accountCode: '1100', debit: '300', credit: '0' },
    { accountCode: '1500', debit: '500', credit: '0' }, { accountCode: '2000', debit: '0', credit: '200' }, { accountCode: '3000', debit: '0', credit: '1600' },
  ], receivables: [
    { partyName: 'Client A', reference: 'HIST-A', date: '2026-01-10', dueDate: '2026-01-31', amount: '100', accountCode: '1100' },
    { partyName: 'Client B', reference: 'HIST-B', date: '2026-01-20', dueDate: '2026-02-15', amount: '200', accountCode: '1100' },
  ], payables: [{ partyName: 'Supplier', reference: 'SUP-1', date: '2026-01-15', dueDate: '2026-02-05', amount: '200', accountCode: '2000' }],
});

test('opening TB and unpaid documents post once, clear exactly and never duplicate revenue or expense', options, async () => {
  const { api, setup } = await fixture(); await setup();
  const input = opening();
  const bad = structuredClone(input); bad.receivables[0].amount = '99';
  assert.equal((await api('/workspace-settings/opening-balances/preview', 'POST', bad)).canPost, false);
  await api('/workspace-settings/opening-balances', 'POST', bad, 400);
  assert.equal((await api('/journal-entries')).length, 0);
  const preview = await api('/workspace-settings/opening-balances/preview', 'POST', input);
  assert.equal(preview.asOf, '2026-01-31'); assert.equal(preview.canPost, true);
  const batches = await Promise.all([api('/workspace-settings/opening-balances', 'POST', input, 201), api('/workspace-settings/opening-balances', 'POST', input, 201)]);
  assert.equal(batches[0].id, batches[1].id);
  assert.equal((await api('/journal-entries')).length, 4);
  await api('/workspace-settings/opening-balances', 'POST', { ...input, requestId: randomUUID() }, 409);
  const pl = await api('/reports/profit-loss?startDate=2026-01-01&endDate=2026-12-31');
  assert.equal(pl.totalRevenue, '0.00'); assert.equal(pl.totalExpenses, '0.00');
  const tb = await api('/reports/trial-balance?asOf=2026-01-31'); assert.equal(tb.currency, 'PHP'); assert.equal(tb.difference, '0.00');
  assert.equal(tb.rows.find(row => row.accountCode === 'OPENING-CLEARING').debitTotal, '0.00');
  const ar = await api('/reports/aging?kind=receivables&asOf=2026-01-31');
  assert.equal(ar.totals.net, '300.00'); assert.equal(ar.reconciliation.balanced, true); assert.equal(ar.buckets.current, '300.00'); assert.equal(ar.parties[0].buckets.current, '100.00');
  const firstInvoice = (await api('/invoices'))[0];
  await api('/invoices/' + firstInvoice.id + '/send', 'POST', {}, 409);
  await api('/invoices/' + firstInvoice.id + '/void', 'POST', { date: '2026-02-02' }, 409);
  const ap = await api('/reports/aging?kind=payables&asOf=2026-01-31'); assert.equal(ap.totals.net, '200.00'); assert.equal(ap.reconciliation.balanced, true);
});

test('payment reversals and reapplication agree with historical AR/AP aging, worklists, summaries and GL', options, async () => {
  const { api, setup } = await fixture(); await setup(); await api('/workspace-settings/opening-balances', 'POST', opening(), 201);
  const accounts = await api('/accounts'); const bank = accounts.find(row => row.role === 'BANK'); const equity = accounts.find(row => row.code === '3000');
  let invoice = (await api('/invoices')).find(row => row.invoiceNo === 'HIST-A');
  const payInput = { paymentAccountId: bank.id, amount: '40', date: '2026-02-05', requestId: randomUUID() };
  invoice = (await api('/invoices/' + invoice.id + '/record-payment', 'POST', payInput)).invoice;
  const payment = invoice.payments[0];
  const correction = { date: '2026-02-08', reason: 'Applied to the wrong invoice', requestId: randomUUID() };
  const path = '/invoices/' + invoice.id + '/payments/' + payment.id + '/reverse';
  await api(path, 'POST', { ...correction, date: '2026-02-04' }, 400);
  invoice = await api(path, 'POST', correction); assert.equal(invoice.balanceDue, '100.00');
  await api(path, 'POST', correction); await api(path, 'POST', { ...correction, reason: 'A different correction' }, 409);
  assert.equal((await api('/reports/aging?kind=receivables&asOf=2026-02-06')).totals.net, '260.00');
  let ar = await api('/reports/aging?kind=receivables&asOf=2026-02-09'); assert.equal(ar.totals.net, '300.00'); assert.equal(ar.reconciliation.balanced, true);
  await api('/invoices/' + invoice.id + '/record-payment', 'POST', { ...payInput, date: '2026-02-09', requestId: randomUUID() });
  assert.equal((await api('/invoices/summary')).openBalance, '260.00');
  assert.equal((await api('/invoices?page=1')).items.find(row => row.id === invoice.id).balanceDue, '60.00');
  ar = await api('/reports/aging?kind=receivables&asOf=2026-02-09'); assert.equal(ar.totals.net, '260.00'); assert.equal(ar.reconciliation.balanced, true);
  let bill = (await api('/bills'))[0];
  bill = await api('/bills/' + bill.id + '/pay', 'POST', { paymentAccountId: bank.id, amount: '75', date: '2026-02-03', requestId: randomUUID() });
  bill = await api('/bills/' + bill.id + '/payments/' + bill.payments[0].id + '/reverse', 'POST', { date: '2026-02-08', reason: 'Wrong payment amount recorded', requestId: randomUUID() });
  assert.equal(bill.balanceDue, '200.00');
  assert.equal((await api('/reports/aging?kind=payables&asOf=2026-02-05')).totals.net, '125.00');
  assert.equal((await api('/reports/aging?kind=payables&asOf=2026-02-09')).totals.net, '200.00');
  assert.equal((await api('/bills/summary')).openBalance, '200.00');
  const control = accounts.find(row => row.role === 'ACCOUNTS_RECEIVABLE');
  const journal = await api('/journal-entries', 'POST', { date: '2026-02-10', description: 'Manual AR adjustment needing reconciliation', journalLines: [{ accountId: control.id, debit: '25' }, { accountId: equity.id, credit: '25' }] }, 201);
  await api('/journal-entries/' + journal.id + '/post', 'POST');
  ar = await api('/reports/aging?kind=receivables&asOf=2026-02-10');
  assert.equal(ar.reconciliation.difference, '25.00'); assert.equal(ar.reconciliation.balanced, false);
});

test('CSV opening imports stay atomic at the supported limit, with exact cents and no per-document database round trips', options, async () => {
  const { api, setup } = await fixture(); await setup();
  const input = { requestId: randomUUID(), balancesCsv: 'accountCode,debit,credit\n1100,10.00,0\n2000,0,10.00',
    receivablesCsv: 'partyName,reference,date,dueDate,amount,accountCode\n' + Array.from({ length: 1000 }, (_, i) => 'Client,CSV-AR-' + i + ',2026-01-01,2026-02-28,0.01,1100').join('\n'),
    payablesCsv: 'partyName,reference,date,dueDate,amount,accountCode\n' + Array.from({ length: 1000 }, (_, i) => 'Supplier,CSV-AP-' + i + ',2026-01-01,2026-02-28,0.01,2000').join('\n') };
  assert.equal((await api('/workspace-settings/opening-balances/preview', 'POST', input)).canPost, true);
  await api('/workspace-settings/opening-balances', 'POST', input, 201);
  const ar = await api('/reports/aging?kind=receivables&asOf=2026-02-28&page=40');
  assert.equal(ar.total, 1000); assert.equal(ar.items.length, 25); assert.equal(ar.totals.net, '10.00'); assert.equal(ar.reconciliation.balanced, true);
  const ap = await api('/reports/aging?kind=payables&asOf=2026-02-28');
  assert.equal(ap.total, 1000); assert.equal(ap.totals.net, '10.00'); assert.equal(ap.reconciliation.balanced, true);
});

test('corrections require admin authority, refuse matched bank lines, reopen fully paid invoices and preserve historical void cutoffs', {
  skip: !root || !process.env.ACCOUNTING_TEST_DATABASE_URL,
}, async () => {
  const dbUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname));
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: dbUrl });
  const { api, setup, session } = await fixture(); await setup();
  try {
    const accounts = await api('/accounts'); const bank = accounts.find(row => row.role === 'BANK');
    const ar = accounts.find(row => row.role === 'ACCOUNTS_RECEIVABLE'); const revenue = accounts.find(row => row.type === 'REVENUE');
    const customer = await api('/customers', 'POST', { name: 'Correction client' }, 201);
    let invoice = await api('/invoices', 'POST', { customerId: customer.id, date: '2026-02-01', dueDate: '2026-02-02',
      lines: [{ description: 'Work', quantity: '1', unitPrice: '100', accountId: revenue.id }] }, 201);
    await api('/invoices/' + invoice.id + '/post', 'POST', { receivableAccountId: ar.id });
    invoice = (await api('/invoices/' + invoice.id + '/record-payment', 'POST', { paymentAccountId: bank.id, amount: '100', date: '2026-02-02', requestId: randomUUID() })).invoice;
    assert.equal(invoice.status, 'PAID');
    await api('/reconciliation/import', 'POST', { accountId: bank.id, transactions: [{ date: '2026-02-02', description: 'Collection', amount: '100' }] }, 201);
    const suggestion = (await api('/reconciliation/' + bank.id + '/suggestions')).suggestions[0];
    await api('/reconciliation/match', 'POST', { bankTransactionId: suggestion.bankTransactionId, journalLineId: suggestion.candidates[0].journalLineId });
    const path = '/invoices/' + invoice.id + '/payments/' + invoice.payments[0].id + '/reverse';
    const correction = { date: '2026-02-03', reason: 'Wrong recorded collection', requestId: randomUUID() };
    await api(path, 'POST', correction, 409);
    await api('/reconciliation/unmatch', 'POST', { bankTransactionId: suggestion.bankTransactionId });
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: session.workspace.id, userId: session.user.id } }, data: { role: 'MEMBER' } });
    await api(path, 'POST', correction, 403);
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: session.workspace.id, userId: session.user.id } }, data: { role: 'OWNER' } });
    invoice = await api(path, 'POST', correction); assert.equal(invoice.status, 'SENT'); assert.equal(invoice.balanceDue, '100.00');
    await api('/invoices/' + invoice.id + '/void', 'POST', { date: '2026-02-04' });
    assert.equal((await api('/reports/aging?kind=receivables&asOf=2026-02-01')).totals.net, '100.00');
    assert.equal((await api('/reports/aging?kind=receivables&asOf=2026-02-02')).totals.net, '0.00');
    const beforeVoid = await api('/reports/aging?kind=receivables&asOf=2026-02-03');
    assert.equal(beforeVoid.totals.net, '100.00'); assert.equal(beforeVoid.reconciliation.balanced, true);
    const afterVoid = await api('/reports/aging?kind=receivables&asOf=2026-02-04');
    assert.equal(afterVoid.totals.net, '0.00'); assert.equal(afterVoid.reconciliation.balanced, true);
  } finally { await db.$disconnect(); }
});
