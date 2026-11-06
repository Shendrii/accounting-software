import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const url = process.env.LEDGER_TEST_API;

test('posted invoices, partial collections, and manual journals keep one consistent ledger', {
  skip: !url && 'Set LEDGER_TEST_API to a local server backed by a disposable test database.',
}, async () => {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname));
  const signup = async () => {
    const response = await fetch(url + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ledger test', email: randomUUID() + '@example.test', password: 'test-only-password' }),
    });
    assert.equal(response.status, 201);
    const { token, workspace } = await response.json();
    return async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(url + '/api' + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, 'x-workspace-id': workspace.id, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json();
      if (Array.isArray(status)) assert.ok(status.includes(response.status), JSON.stringify(payload));
      else assert.equal(response.status, status, JSON.stringify(payload));
      return payload;
    };
  };
  const api = await signup();
  const other = await signup();
  const account = (code, name, type, client = api) => client('/accounts', 'POST', { code, name, type }, 201);
  const cash = await account('1000', 'Checking', 'ASSET');
  const ar = await account('1100', 'Trade debtors', 'ASSET');
  const tax = await account('2100', 'Sales tax payable', 'LIABILITY');
  const revenue = await account('4000', 'Design services', 'REVENUE');
  const foreignCash = await account('1000', 'Other checking', 'ASSET', other);
  const customer = await api('/customers', 'POST', { name: 'Fieldwork Co.' }, 201);
  const day = '2026-10-10';

  const draft = (taxAmount = '0.00') => api('/invoices', 'POST', {
    customerId: customer.id, date: day, dueDate: '2026-10-30', tax: taxAmount,
    lines: [{ description: 'Design services', quantity: '1', unitPrice: '100.00', amount: '1.00' }],
  }, 201);
  const invoice = await draft();
  assert.equal(invoice.total, '100');
  const invoicePath = '/invoices/' + invoice.id;
  const postingOptions = { receivableAccountId: ar.id, revenueAccountId: revenue.id };
  const payment = { paymentAccountId: cash.id, amount: '40.00', date: day, requestId: randomUUID() };
  await api(invoicePath + '/record-payment', 'POST', payment, 409);
  const postings = await Promise.all([
    api(invoicePath + '/post', 'POST', postingOptions),
    api(invoicePath + '/post', 'POST', postingOptions),
  ]);
  assert.equal(postings[0].postingEntryId, postings[1].postingEntryId);
  assert.equal(postings[0].lines[0].accountId, revenue.id);
  await api(invoicePath + '/record-payment', 'POST', { ...payment, paymentAccountId: foreignCash.id }, 400);
  const receipts = await Promise.all([
    api(invoicePath + '/record-payment', 'POST', payment),
    api(invoicePath + '/record-payment', 'POST', payment),
  ]);
  assert.equal(receipts[0].journalEntry.id, receipts[1].journalEntry.id);
  assert.equal(receipts[1].invoice.balanceDue, '60.00');
  assert.equal(receipts[1].invoice.payments.length, 1);
  await api(invoicePath + '/record-payment', 'POST', { ...payment, amount: '45.00' }, 409);
  await api(invoicePath + '/void', 'POST', {}, 409);

  const accounts = await api('/accounts');
  assert.equal(accounts.find(item => item.id === ar.id).balance, '60');
  assert.equal(accounts.find(item => item.id === cash.id).balance, '40');
  const profit = await api('/reports/profit-loss?startDate=' + day + '&endDate=' + day);
  assert.equal(profit.totalRevenue, '100.00');
  const sheet = await api('/reports/balance-sheet?asOf=' + day);
  assert.equal(sheet.totalAssets, '100.00');
  assert.equal(sheet.totalEquity, '100.00');
  assert.equal(sheet.difference, '0.00');
  const dashboard = await api('/dashboard');
  assert.equal(dashboard.cashBalance, '40.00');
  assert.equal(dashboard.outstandingInvoicesTotal, '60.00');

  const rest = { ...payment, amount: '60.00', requestId: randomUUID() };
  await api(invoicePath + '/record-payment', 'POST', { ...rest, date: '2026-10-09' }, 400);
  const final = await Promise.all([
    api(invoicePath + '/record-payment', 'POST', rest),
    api(invoicePath + '/record-payment', 'POST', rest),
  ]);
  assert.equal(final[0].journalEntry.id, final[1].journalEntry.id);
  assert.equal(final[0].invoice.status, 'PAID');
  assert.equal(final[0].invoice.balanceDue, '0.00');

  const taxable = await draft('5.00');
  const taxPath = '/invoices/' + taxable.id;
  await api(taxPath + '/post', 'POST', postingOptions, 400);
  const taxed = await api(taxPath + '/post', 'POST', { ...postingOptions, taxAccountId: tax.id });
  assert.equal(taxed.postingEntry.journalLines.find(line => line.accountId === tax.id).credit, '5');
  await api(taxPath + '/void', 'POST', { date: day });
  await api(taxPath + '/void', 'POST', { date: day });
  const original = await api('/journal-entries/' + taxed.postingEntryId);
  assert.ok(original.reversal.id);

  const historical = await draft();
  const legacyPath = '/invoices/' + historical.id;
  const legacy = await api(legacyPath + '/send', 'POST');
  assert.equal(legacy.postingEntryId, null);
  await api(legacyPath + '/post', 'POST', postingOptions, 409);
  const reviewed = await api(legacyPath + '/post', 'POST', { ...postingOptions, confirmUnposted: true });
  assert.ok(reviewed.postingEntryId);

  const lines = [
    { accountId: cash.id, debit: '0.10' },
    { accountId: cash.id, debit: '0.20' },
    { accountId: revenue.id, credit: '0.30' },
  ];
  await api('/journal-entries', 'POST', { date: day, description: 'Foreign account', journalLines: [
    { accountId: foreignCash.id, debit: '0.30' }, lines[2],
  ] }, 400);
  const journal = await api('/journal-entries', 'POST', { date: day, description: 'Exact cents', journalLines: lines }, 201);
  const journalPath = '/journal-entries/' + journal.id;
  await Promise.all([api(journalPath + '/post', 'POST'), api(journalPath + '/post', 'POST')]);
  await api(journalPath, 'PUT', { date: '2026-10-11' }, 409);
  const after = await api('/accounts/' + cash.id);
  assert.equal(after.balance, '100.3');
  const reverse = { date: day, reason: 'Correct test entry' };
  const reversals = await Promise.all([
    api(journalPath + '/reverse', 'POST', reverse),
    api(journalPath + '/reverse', 'POST', reverse),
  ]);
  assert.equal(reversals[0].id, reversals[1].id);
  assert.equal((await api('/accounts/' + cash.id)).balance, '100');

  const competing = await Promise.all(['80.00', '75.00'].map(amount =>
    api(legacyPath + '/record-payment', 'POST', { ...payment, amount, requestId: randomUUID() }, [200, 400])));
  assert.equal(competing.filter(result => result.invoice).length, 1);
  assert.equal((await api(legacyPath)).payments.length, 1);
});
