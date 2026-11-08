import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const url = process.env.WORKFLOWS_TEST_API;
const options = { skip: !url && 'Set WORKFLOWS_TEST_API to a disposable local API with a stub receipt OCR service.' };

async function fixture() {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
  const response = await fetch(url + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Workflow test', email: randomUUID() + '@example.test', password: 'local-fixture-password' }),
  });
  assert.equal(response.status, 201);
  const { token, workspace } = await response.json();
  return async (path, method = 'GET', body, expected = 200) => {
    const multipart = body instanceof FormData;
    const result = await fetch(url + '/api' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token, 'x-workspace-id': workspace.id,
        ...(!multipart && body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: multipart || body === undefined ? body : JSON.stringify(body),
    });
    const payload = await result.json();
    assert.equal(result.status, expected, method + ' ' + path + ' ' + JSON.stringify(payload));
    return payload;
  };
}

const account = (api, code, name, type, isBankAccount = false) => api('/accounts', 'POST', { code, name, type, isBankAccount, role: isBankAccount ? 'BANK' : code === '1000' ? 'CASH' : code === '2000' ? 'ACCOUNTS_PAYABLE' : 'GENERAL' }, 201);
const line = (accountId, debit, credit) => ({ accountId, debit, credit });

test('reconciliation requires verified matches, the statement control totals, and a saved zero-difference proof', options, async () => {
  const [api, other] = await Promise.all([fixture(), fixture()]);
  const bank = await account(api, '1000', 'Checking', 'ASSET', true);
  const equity = await account(api, '3000', 'Opening equity', 'EQUITY');
  const fees = await account(api, '6000', 'Bank fees', 'EXPENSE');
  const otherBank = await account(other, '1000', 'Checking', 'ASSET', true);
  const journal = async (date, description, amount, post = true) => {
    const inflow = amount > 0;
    const value = String(Math.abs(amount));
    const entry = await api('/journal-entries', 'POST', {
      date, description, journalLines: [line(bank.id, inflow ? value : '0', inflow ? '0' : value), line(equity.id, inflow ? '0' : value, inflow ? value : '0')],
    }, 201);
    return post ? api('/journal-entries/' + entry.id + '/post', 'POST') : entry;
  };
  const bankLine = entry => entry.journalLines.find(item => item.accountId === bank.id).id;
  await journal('2026-09-30', 'Opening', 1000);
  const deposit = await journal('2026-10-08', 'Fieldwork', 500);
  const vendor = await journal('2026-10-19', 'Vendor payment', -150);
  const outstandingCheck = await journal('2026-10-29', 'Outstanding check', -200);
  const inTransit = await journal('2026-10-30', 'Deposit in transit', 120);
  const future = await journal('2026-11-03', 'November deposit', 150);
  const draft = await journal('2026-10-20', 'Unposted draft', 500, false);

  const transactions = [
    { date: '2026-10-08', description: 'Fieldwork', amount: '500.00' },
    { date: '2026-10-19', description: 'Vendor payment', amount: '-150.00' },
    { date: '2026-10-31', description: 'Monthly bank fee', amount: '-5.00' },
  ];
  const csv = new FormData();
  csv.append('accountId', bank.id);
  csv.append('csv', new Blob(['date,description,amount\n' + transactions.map(row => [row.date,row.description,row.amount].join(',')).join('\n')], { type: 'text/csv' }), 'statement.csv');
  const preview=await api('/reconciliation/import-csv/preview','POST',csv);
  csv.append('previewToken',preview.token);
  assert.equal((await api('/reconciliation/import-csv', 'POST', csv, 201)).imported, 3);
  assert.equal((await api('/reconciliation/import', 'POST', { accountId: bank.id, transactions }, 201)).imported, 0);
  await api('/reconciliation/import', 'POST', { accountId: otherBank.id, transactions }, 404);
  const statement = {
    accountId: bank.id, statementStart: '2026-10-01', statementDate: '2026-10-31',
    openingBalance: '1000', statementBalance: '1345', statementLineCount: '3',
  };
  let review = await api('/reconciliation/review', 'POST', statement);
  assert.equal(review.unresolved, 3, 'imports leave matches for explicit review');
  assert.equal(review.adjustedBook, '1270.00', 'future and draft entries are excluded');
  const [bankDeposit, bankVendor, bankFee] = review.bankTransactions;
  const match = (row, entry, status = 200) => api('/reconciliation/match', 'POST', {
    bankTransactionId: row.id, journalLineId: bankLine(entry),
  }, status);
  await match(bankDeposit, draft, 404);
  await match(bankVendor, future, 400);
  await match(bankDeposit, deposit);
  await match(bankVendor, vendor);
  const outstandingIds = [bankLine(outstandingCheck), bankLine(inTransit)];
  const proofInput = { ...statement, outstandingIds };
  review = await api('/reconciliation/review', 'POST', proofInput);
  assert.equal(review.difference, '-5.00');
  await api('/reconciliation/complete', 'POST', proofInput, 409);
  const feeInput = { bankTransactionId: bankFee.id, expenseAccountId: fees.id };
  await api('/reconciliation/post-fee', 'POST', feeInput);
  await api('/reconciliation/post-fee', 'POST', feeInput);
  await api('/reconciliation/complete', 'POST', { ...proofInput, statementLineCount: '4' }, 409);
  await api('/reconciliation/complete', 'POST', { ...proofInput, openingBalance: '999' }, 409);
  await api('/reconciliation/complete', 'POST', { ...proofInput, outstandingIds: [] }, 409);
  const record = await api('/reconciliation/complete', 'POST', proofInput, 201);
  const retry = await api('/reconciliation/complete', 'POST', proofInput, 201);
  assert.equal(retry.id, record.id);
  assert.equal(record.proof.adjustedBank, '1265.00');
  assert.equal(record.proof.adjustedBook, '1265.00');
  assert.equal(record.proof.matches.length, 3);
  assert.equal((await api('/reconciliation/history/' + bank.id))[0].proof.difference, '0.00');
  assert.deepEqual(await other('/reconciliation/history/' + bank.id), []);
  await api('/reconciliation/unmatch', 'POST', { bankTransactionId: bankFee.id }, 409);
  await api('/reconciliation/import', 'POST', { accountId: bank.id, transactions: [{ ...transactions[0], amount: '50' }] }, 409);
  await api('/journal-entries/' + draft.id + '/post', 'POST', undefined, 409);

  const next = { ...statement, statementStart: '2026-11-01', statementDate: '2026-11-02', openingBalance: '1345', statementBalance: '1265', statementLineCount: '2' };
  await api('/reconciliation/import', 'POST', { accountId: bank.id, transactions: [
    { date: '2026-11-01', description: 'Check cleared', amount: '-200' },
    { date: '2026-11-02', description: 'Deposit cleared', amount: '120' },
  ] }, 201);
  review = await api('/reconciliation/review', 'POST', next);
  assert.equal(review.outstanding.length, 2);
  await match(review.bankTransactions[0], outstandingCheck);
  await match(review.bankTransactions[1], inTransit);
  assert.equal((await api('/reconciliation/complete', 'POST', { ...next, outstandingIds: [] }, 201)).proof.difference, '0.00');
});

test('receipt attachment leaves bills unpaid and partial bill payments agree with the ledger', options, async () => {
  const api = await fixture();
  const cash = await account(api, '1000', 'Petty cash', 'ASSET');
  const payable = await account(api, '2000', 'Accounts Payable', 'LIABILITY');
  const expense = await account(api, '6000', 'Printing', 'EXPENSE');
  const shipping = await account(api, '6010', 'Shipping', 'EXPENSE');
  const vendor = await api('/vendors', 'POST', { name: 'Harbor Print' }, 201);
  const billData = {
    vendorId: vendor.id, date: '2026-10-20', dueDate: '2026-11-04',
    lines: [
      { description: 'Print', quantity: '1', unitPrice: '75', amount: '9', accountId: expense.id },
      { description: 'Ship', quantity: '1', unitPrice: '25', amount: '9', accountId: shipping.id },
    ],
  };
  const bill = await api('/bills', 'POST', billData, 201);
  const path = '/bills/' + bill.id;
  const posted = await api(path + '/receive', 'POST');
  assert.equal(posted.balanceDue, '100.00');
  assert.equal((await api('/accounts/' + shipping.id)).balance, '25');
  assert.equal((await api('/accounts/' + payable.id)).balance, '100');

  const upload = new FormData();
  upload.append('image', new Blob([Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQYlWP4TwRgGFXEMAiDAABA965gzYd12AAAAABJRU5ErkJggg==', 'base64',
  )], { type: 'image/png' }), 'sample.png');
  const receipt = await api('/receipts/upload', 'POST', upload, 201);
  const receiptPath = '/receipts/' + receipt.id;
  await api(receiptPath + '/attach-to-bill', 'POST', { billId: bill.id }, 400);
  await api(receiptPath, 'PUT', { extractedData: { invoiceDate: '2026-24-10', total: 40 } }, 400);
  await api(receiptPath, 'PUT', { extractedData: { invoiceDate: '2026-10-24', total: 40 } });
  const attached = await api(receiptPath + '/attach-to-bill', 'POST', { billId: bill.id });
  assert.equal(attached.billId, bill.id);
  assert.equal(attached.journalEntryId, null);
  assert.equal((await api(path)).balanceDue, '100.00');
  assert.equal((await api('/accounts/' + cash.id)).balance, '0');

  const input = { paymentAccountId: cash.id, amount: '40', date: '2026-11-05', requestId: randomUUID() };
  const [partial, replay] = await Promise.all([api(path + '/pay', 'POST', input), api(path + '/pay', 'POST', input)]);
  assert.equal(partial.balanceDue, '60.00');
  assert.equal(partial.payments.length, 1);
  assert.equal(replay.payments[0].id, partial.payments[0].id);
  assert.equal((await api('/accounts/' + payable.id)).balance, '60');
  assert.equal((await api('/accounts/' + cash.id)).balance, '-40');
  await api(path + '/pay', 'POST', { ...input, requestId: randomUUID(), amount: '61' }, 400);
  await api(path + '/void', 'POST', { date: '2026-11-05', reason:'Reviewed cancellation supported by fixture evidence' }, 409);
  const paid = await api(path + '/pay', 'POST', { ...input, requestId: randomUUID(), amount: '60' });
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.balanceDue, '0.00');

  const unpaid = await api('/bills', 'POST', billData, 201);
  const unpaidPath = '/bills/' + unpaid.id;
  await api(unpaidPath + '/receive', 'POST');
  assert.equal((await api(unpaidPath + '/void', 'POST', { date: '2026-11-05', reason:'Reviewed cancellation supported by fixture evidence' })).status, 'VOID');
  assert.equal((await api('/accounts/' + payable.id)).balance, '0');
  assert.equal((await api('/accounts/' + expense.id)).balance, '75');
});
