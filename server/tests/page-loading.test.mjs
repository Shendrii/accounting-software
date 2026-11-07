import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const url = process.env.PERFORMANCE_TEST_API;
const cents = value => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const money = value => (value / 100n).toString() + '.' + (value % 100n).toString().padStart(2, '0');

test('bounded summaries agree with full document lists and remain isolated by workspace', {
  skip: !url && 'Set PERFORMANCE_TEST_API to a disposable local API.',
}, async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
  async function signup() {
    const response = await fetch(url + '/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Page query test', email: randomUUID() + '@example.test', password: 'disposable-test-only' }),
    });
    assert.equal(response.status, 201);
    const { token, workspace } = await response.json();
    return async (path, method = 'GET', body, expected = 200, workspaceId = workspace.id) => {
      const result = await fetch(url + '/api' + path, {
        method, headers: { Authorization: 'Bearer ' + token, 'x-workspace-id': workspaceId, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await result.json();
      assert.equal(result.status, expected, path + ' ' + JSON.stringify(payload));
      return payload;
    };
  }
  const [api, outsider] = await Promise.all([signup(), signup()]);
  const account = (code, name, type) => api('/accounts', 'POST', { code, name, type }, 201);
  const cash = await account('1000', 'Cash', 'ASSET');
  const ar = await account('1100', 'Receivables', 'ASSET');
  const ap = await account('2000', 'Accounts Payable', 'LIABILITY');
  const revenue = await account('4000', 'Design revenue', 'REVENUE');
  const expense = await account('6000', 'Printing', 'EXPENSE');
  const customer = await api('/customers', 'POST', { name: 'Test customer' }, 201);
  const vendor = await api('/vendors', 'POST', { name: 'Test vendor' }, 201);
  const today = '2026-11-07';
  for (let index = 0; index < 10; index++) {
    const dueDate = index === 0 ? today : index < 3 ? '2026-11-06' : index < 6 ? '2026-11-14' : '2026-11-15';
    const invoice = await api('/invoices', 'POST', {
      customerId: customer.id, date: '2026-11-01', dueDate,
      lines: [{ description: 'Design', quantity: '1', unitPrice: '100.01' }],
    }, 201);
    const bill = await api('/bills', 'POST', {
      vendorId: vendor.id, date: '2026-11-01', dueDate,
      lines: [{ description: 'Print', quantity: '1', unitPrice: '100.01', amount: '1', accountId: expense.id }],
    }, 201);
    if (index < 7 || index === 9) {
      await api('/invoices/' + invoice.id + '/post', 'POST', { receivableAccountId: ar.id, revenueAccountId: revenue.id });
      await api('/bills/' + bill.id + '/receive', 'POST');
      const payment = { paymentAccountId: cash.id, amount: index === 1 ? '100.01' : '33.33', date: '2026-11-02', requestId: randomUUID() };
      await api('/invoices/' + invoice.id + '/record-payment', 'POST', payment);
      await api('/bills/' + bill.id + '/pay', 'POST', { ...payment, requestId: randomUUID() });
    }
    if (index === 8) await api('/invoices/' + invoice.id + '/send', 'POST');
  }

  const sales = await api('/invoices/summary?today=' + today);
  const purchases = await api('/bills/summary?today=' + today);
  const invoices = await api('/invoices');
  const bills = await api('/bills');
  const openInvoices = invoices.filter(row => row.status === 'SENT' && row.postingEntryId && cents(row.balanceDue) > 0n);
  const openBills = bills.filter(row => row.status === 'RECEIVED' && row.postingEntryId && cents(row.balanceDue) > 0n);
  const sum = rows => money(rows.reduce((total, row) => total + cents(row.balanceDue), 0n));
  assert.equal(sales.openCount, openInvoices.length);
  assert.equal(sales.openBalance, sum(openInvoices));
  assert.equal(sales.overdueBalance, sum(openInvoices.filter(row => row.dueDate.slice(0, 10) < today)));
  assert.equal(sales.draftCount, invoices.filter(row => row.status === 'DRAFT').length);
  assert.equal(purchases.openBalance, sum(openBills));
  assert.equal(purchases.overdueBalance, sum(openBills.filter(row => row.dueDate.slice(0, 10) < today)));
  assert.equal(purchases.dueSoonBalance, sum(openBills.filter(row => {
    const due = row.dueDate.slice(0, 10);
    return due >= today && due <= '2026-11-14';
  })));
  assert.equal(sales.recent.length, 6);
  assert.equal(purchases.recent.length, 6);
  for (const row of sales.recent) {
    const full = invoices.find(item => item.id === row.id);
    assert.equal(row.balanceDue, full.balanceDue);
    assert.equal(row.amountPaid, full.amountPaid);
    assert.equal(row.customer.name, full.customer.name);
    assert.ok(Number.isFinite(Date.parse(row.date)));
    assert.ok(!('notes' in row));
  }
  for (const row of purchases.recent) {
    const full = bills.find(item => item.id === row.id);
    assert.equal(row.balanceDue, full.balanceDue);
    assert.equal(row.amountPaid, full.amountPaid);
  }
  const overview = await api('/dashboard?today=' + today);
  assert.deepEqual(overview.sales, sales);
  assert.deepEqual(overview.purchases, purchases);
  assert.deepEqual(overview.closeChecklist, await api('/dashboard/close-checklist?today=' + today));
  assert.equal(overview.closeChecklist.overdueInvoices, openInvoices.filter(row => row.dueDate.slice(0, 10) < today).length);
  const profit = await api('/reports/profit-loss?startDate=2026-11-01&endDate=2026-11-01');
  assert.equal(profit.totalRevenue, '800.08');
  assert.equal(profit.totalExpenses, '800.08');
  assert.equal((await api('/reports/profit-loss?startDate=2026-11-02&endDate=2026-11-02')).totalRevenue, '0.00');
  assert.equal((await api('/reports/balance-sheet?asOf=2026-10-31')).totalAssets, '0.00');
  const trial = await api('/reports/trial-balance?startDate=2026-11-01&endDate=2026-11-01');
  assert.equal(trial.totals.debitTotal, '1600.16');
  assert.equal(trial.totals.creditTotal, '1600.16');
  const journals = await api('/journal-entries');
  const posting = journals.find(entry => entry.invoicePosting);
  assert.ok(posting.invoicePosting.invoiceNo);
  assert.ok(posting.journalLines.every(line => line.account.id && line.account.code && line.account.name));
  assert.ok(posting.journalLines.every(line => !('balance' in line.account)));
  const fullPosting = await api('/journal-entries/' + posting.id);
  assert.deepEqual(posting.journalLines.map(({ account, ...line }) => line), fullPosting.journalLines.map(({ account, ...line }) => line));
  const isolated = await outsider('/invoices/summary?today=' + today);
  assert.equal(isolated.openCount, 0);
  assert.equal(isolated.openBalance, '0.00');
  assert.deepEqual(isolated.recent, []);
  await api('/invoices/summary?today=2026-99-99', 'GET', undefined, 400);
  await api('/invoices/summary', 'GET', undefined, 403, "' OR true --");
  assert.equal(cents((await api('/accounts/' + ap.id)).balance), cents(purchases.openBalance));
});
