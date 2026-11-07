import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';

const url = process.env.ACCOUNTING_TEST_API;
const options = { skip: !url && 'Set ACCOUNTING_TEST_API to a disposable local API with stub OCR.' };

async function fixture() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
  const signup = await fetch(url + '/api/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Accounting test', email: randomUUID() + '@example.test', password: 'disposable-test-only' }),
  });
  assert.equal(signup.status, 201);
  const { token, workspace } = await signup.json();
  const api = async (path, method = 'GET', body, expected = 200) => {
    const multipart = body instanceof FormData;
    const response = await fetch(url + '/api' + path, {
      method, headers: { Authorization: 'Bearer ' + token, 'x-workspace-id': workspace.id,
        ...(!multipart && body !== undefined && { 'Content-Type': 'application/json' }) },
      body: multipart || body === undefined ? body : JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, method + ' ' + path + ': ' + JSON.stringify(data));
    return data;
  };
  const account = (code, type, role = 'GENERAL') => api('/accounts', 'POST', { code, name: 'Account ' + code, type, role }, 201);
  return { api, account };
}

async function upload(api, image) {
  const form = new FormData();
  form.append('image', new Blob([image], { type: 'image/png' }), 'receipt.png');
  return api('/receipts/upload', 'POST', form, 201);
}
const image = () => sharp(randomBytes(12 * 12 * 3), { raw: { width: 12, height: 12, channels: 3 } }).png().toBuffer();

test('account roles prevent fake cash, wrong control accounts, and unrelated payment accounts', options, async () => {
  const { api, account } = await fixture();
  const bank = await account('1000', 'ASSET', 'BANK');
  const ar = await account('1100', 'ASSET', 'ACCOUNTS_RECEIVABLE');
  const equipment = await account('1200', 'ASSET');
  const payable = await account('2000', 'LIABILITY', 'ACCOUNTS_PAYABLE');
  const tax = await account('2100', 'LIABILITY', 'SALES_TAX');
  const revenue = await account('4000', 'REVENUE');
  const expense = await account('6000', 'EXPENSE');
  await api('/accounts', 'POST', { code: 'bad', name: 'Bad role', type: 'LIABILITY', role: 'BANK' }, 400);
  const customer = await api('/customers', 'POST', { name: 'Client' }, 201);
  const vendor = await api('/vendors', 'POST', { name: 'Supplier' }, 201);
  const invoice = await api('/invoices', 'POST', { customerId: customer.id, date: '2026-02-01', dueDate: '2026-03-01', tax: '5',
    lines: [{ description: 'Work', quantity: '1', unitPrice: '100', accountId: revenue.id }] }, 201);
  const path = '/invoices/' + invoice.id;
  await api(path + '/post', 'POST', { receivableAccountId: bank.id, taxAccountId: tax.id }, 400);
  await api(path + '/post', 'POST', { receivableAccountId: ar.id, taxAccountId: payable.id }, 400);
  await api(path + '/post', 'POST', { receivableAccountId: ar.id, taxAccountId: tax.id });
  assert.equal((await api('/dashboard')).cashBalance, '0.00');
  for (const invalid of [equipment, ar]) await api(path + '/record-payment', 'POST', {
    paymentAccountId: invalid.id, amount: '40', date: '2026-02-02', requestId: randomUUID(),
  }, 400);
  await api(path + '/record-payment', 'POST', { paymentAccountId: bank.id, amount: '40', date: '2026-02-02', requestId: randomUUID() });
  assert.equal((await api('/dashboard')).cashBalance, '40.00');
  assert.equal((await api(path)).balanceDue, '65.00');
  await api('/accounts/' + bank.id, 'PUT', { role: 'GENERAL', isBankAccount: false }, 409);
  await api('/bills', 'POST', { vendorId: vendor.id, date: '2026-02-01', dueDate: '2026-03-01',
    lines: [{ description: 'Wrong cash coding', quantity: '1', unitPrice: '20', accountId: bank.id }] }, 400);
  const bill = await api('/bills', 'POST', { vendorId: vendor.id, vendorInvoiceNo: 'supp-01', date: '2026-02-01', dueDate: '2026-03-01',
    lines: [{ description: 'Supplies', quantity: '1', unitPrice: '20', accountId: expense.id }] }, 201);
  await api('/bills/' + bill.id + '/receive', 'POST');
  await api('/bills/' + bill.id + '/pay', 'POST', { paymentAccountId: ar.id, amount: '20', date: '2026-02-02', requestId: randomUUID() }, 400);
});

test('receipt review separates paid purchases, draft bills, evidence, and duplicate documents', options, async () => {
  const { api, account } = await fixture();
  const bank = await account('1000', 'ASSET', 'BANK');
  await account('2000', 'LIABILITY', 'ACCOUNTS_PAYABLE');
  const expense = await account('6000', 'EXPENSE');
  const vendor = await api('/vendors', 'POST', { name: 'Supplier' }, 201);
  const bytes = await image();
  const receipt = await upload(api, bytes);
  const duplicate = new FormData(); duplicate.append('image', new Blob([bytes], { type: 'image/png' }), 'same.png');
  await api('/receipts/upload', 'POST', duplicate, 409);
  const path = '/receipts/' + receipt.id;
  await api(path, 'PUT', { extractedData: { invoiceDate: '2026-02-01', invoiceNumber: 'Vendor-01', total: '200.00', amountPaid: '50.00', balanceDue: '150.00', items: [{ description: 'Supplies', amount: '200.00' }] } });
  const posting = { expenseAccountId: expense.id, paymentAccountId: bank.id, confirmedTotal: '200.00', paidInFull: true };
  await api(path + '/approve', 'POST', { ...posting, paidInFull: false }, 400);
  await api(path + '/approve', 'POST', posting, 400);
  assert.equal((await api('/accounts/' + bank.id)).balance, '0');
  await api(path + '/create-bill', 'POST', { vendorId: vendor.id, accountId: expense.id, dueDate: '2026-03-01', confirmedTotal: '199.00' }, 409);
  const billInput = { vendorId: vendor.id, accountId: expense.id, dueDate: '2026-03-01', confirmedTotal: '200.00' };
  const drafted = await api(path + '/create-bill', 'POST', billInput);
  assert.equal((await api(path + '/create-bill', 'POST', billInput)).billId, drafted.billId);
  assert.equal((await api('/journal-entries')).length, 0);
  const bill = await api('/bills/' + drafted.billId);
  assert.equal(bill.status, 'DRAFT'); assert.equal(bill.total, '200'); assert.equal(bill.vendorInvoiceNo, 'VENDOR-01');
  assert.equal(bill.receipts[0].id, receipt.id);
  await api('/bills', 'POST', { vendorId: vendor.id, vendorInvoiceNo: ' vendor-01 ', date: '2026-02-01', dueDate: '2026-03-01',
    lines: [{ description: 'Duplicate bill', quantity: '1', unitPrice: '200', accountId: expense.id }] }, 409);
  await api('/bills/' + bill.id + '/receive', 'POST');
  await api('/bills/' + bill.id + '/pay', 'POST', { paymentAccountId: bank.id, amount: '50', date: '2026-02-02', requestId: randomUUID() });
  assert.equal((await api('/bills/' + bill.id)).balanceDue, '150.00');
  const evidence = await upload(api, await image());
  await api('/receipts/' + evidence.id, 'PUT', { extractedData: { invoiceDate: '2026-02-02', total: '50' } });
  await api('/receipts/' + evidence.id, 'PUT', { billId: bill.id });
  await api('/receipts/' + evidence.id + '/create-bill', 'POST', { ...billInput, confirmedTotal: '50' }, 409);
  const entriesBefore = (await api('/journal-entries')).length;
  await api('/receipts/' + evidence.id + '/attach-to-bill', 'POST', { billId: bill.id, vendorId: vendor.id });
  assert.equal((await api('/journal-entries')).length, entriesBefore);
  const billCopy = await upload(api, await image());
  await api('/receipts/' + billCopy.id, 'PUT', { vendorId: vendor.id, extractedData: {
    invoiceDate: '2026-02-02', invoiceNumber: 'vendor-01', total: '200', amountPaid: '200', balanceDue: '0',
  } });
  await api('/receipts/' + billCopy.id + '/approve', 'POST', posting, 409);
  const paid = await upload(api, await image());
  const paidPath = '/receipts/' + paid.id;
  const details = { invoiceDate: '2026-02-03', invoiceNumber: 'paid-02', total: '20.10', amountPaid: '20.10', balanceDue: '0', tax: '0.10', tip: '0', items: [{ description: 'Supplies', amount: '19.00' }] };
  await api(paidPath, 'PUT', { vendorId: vendor.id, extractedData: details });
  const paidInput = { ...posting, confirmedTotal: '20.10' };
  await api(paidPath + '/approve', 'POST', paidInput, 400);
  await api(paidPath, 'PUT', { extractedData: { ...details, items: [{ description: 'Supplies', amount: '20.00' }] } });
  const first = await api(paidPath + '/approve', 'POST', paidInput);
  await api(paidPath, 'PUT', { vendorId: null }, 409);
  assert.equal((await api(paidPath + '/approve', 'POST', paidInput)).journalEntry.id, first.journalEntry.id);
  assert.equal((await api('/accounts/' + bank.id)).balance, '-70.1');
  await api('/bills', 'POST', { vendorId: vendor.id, vendorInvoiceNo: 'PAID-02', date: '2026-02-03', dueDate: '2026-03-01',
    lines: [{ description: 'Already paid', quantity: '1', unitPrice: '20.10', accountId: expense.id }] }, 409);
});

test('trial balance includes opening balances, nets each account, and excludes drafts, future entries, and other workspaces', options, async () => {
  const { api, account } = await fixture();
  const cash = await account('1000', 'ASSET', 'CASH');
  const dormant = await account('1200', 'ASSET');
  const contra = await account('1300', 'ASSET');
  const equity = await account('3000', 'EQUITY');
  const expense = await account('6000', 'EXPENSE');
  async function journal(date, debit, credit, amount, post = true) {
    const entry = await api('/journal-entries', 'POST', { date, description: 'Trial balance fixture',
      journalLines: [{ accountId: debit.id, debit: amount }, { accountId: credit.id, credit: amount }] }, 201);
    if (post) await api('/journal-entries/' + entry.id + '/post', 'POST');
  }
  await journal('2026-01-01', cash, equity, '100.00');
  await journal('2026-02-28', expense, cash, '40.00');
  await journal('2026-02-28', equity, contra, '10.00');
  await journal('2026-03-01', cash, equity, '500.00');
  await journal('2026-02-10', cash, equity, '200.00', false);
  const tb = await api('/reports/trial-balance?asOf=2026-02-28');
  assert.equal(tb.asOf, '2026-02-28'); assert.equal(tb.currency, 'USD'); assert.equal(tb.difference, '0.00');
  const row = id => tb.rows.find(item => item.accountId === id);
  assert.equal(row(cash.id).debitTotal, '60.00'); assert.equal(row(cash.id).creditTotal, '0.00');
  assert.equal(row(expense.id).debitTotal, '40.00'); assert.equal(row(equity.id).creditTotal, '90.00');
  assert.equal(row(contra.id).creditTotal, '10.00'); assert.equal(row(dormant.id).debitTotal, '0.00');
  assert.deepEqual(tb.totals, { debitTotal: '100.00', creditTotal: '100.00' });
  const earlier = await api('/reports/trial-balance?asOf=2026-01-31');
  assert.equal(earlier.rows.find(item => item.accountId === cash.id).debitTotal, '100.00');
  await api('/reports/trial-balance?asOf=2026-02-30', 'GET', undefined, 400);
  const { api: other } = await fixture();
  assert.equal((await other('/reports/trial-balance?asOf=2026-02-28')).rows.length, 0);
});
