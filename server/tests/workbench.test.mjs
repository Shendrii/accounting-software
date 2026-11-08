import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
const url = process.env.ACCOUNTING_TEST_API;
const options = { skip: !url && 'Set ACCOUNTING_TEST_API to a disposable local API.' };
async function fixture() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
  const response = await fetch(url + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Workbench test', email: randomUUID() + '@example.test', password: 'disposable-test-only' }) });
  assert.equal(response.status, 201);
  const { token, workspace } = await response.json();
  const api = async (path, method = 'GET', body, expected = 200) => {
    const res = await fetch(url + '/api' + path, { method, headers: { Authorization: 'Bearer ' + token, 'x-workspace-id': workspace.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json(); assert.equal(res.status, expected, path + ': ' + JSON.stringify(data)); return data;
  };
  const account = (code, type, role = 'GENERAL') => api('/accounts', 'POST', { code, name: code, type, role }, 201);
  return { api, account };
}
test('journal pagination filters before paging and full history retains actors and source links',options,async()=>{const{api,account}=await fixture(),cash=await account('1000','ASSET','CASH'),equity=await account('3000','EQUITY');const drafts=[];for(let i=0;i<3;i++)drafts.push(await api('/journal-entries','POST',{date:'2026-02-0'+(i+1),description:'Paged journal fixture '+i,referenceNo:'PAGE-'+i,journalLines:[{accountId:cash.id,debit:'1'},{accountId:equity.id,credit:'1'}]},201));await api('/journal-entries/'+drafts[0].id+'/post','POST',{});const page=await api('/journal-entries?page=1&pageSize=1&status=DRAFT&q=Paged');assert.equal(page.total,2);assert.equal(page.items.length,1);assert.equal(page.items[0].id,drafts[2].id);assert.equal((await api('/journal-entries?page=2&pageSize=1&status=DRAFT')).items[0].id,drafts[1].id);const detail=await api('/journal-entries/'+drafts[0].id);assert.equal(detail.actorNames[detail.postedById],'Workbench test');assert.deepEqual(detail.sourceLinks,[]);assert.equal((await api('/journal-entries?page=1&startDate=2026-02-03&endDate=2026-02-03')).total,1);});
test('paged worklists sort exact balances, filter before paging, and preserve legacy responses', options, async () => {
  const { api, account } = await fixture();
  const cash = await account('1000', 'ASSET', 'BANK'); const ar = await account('1100', 'ASSET', 'ACCOUNTS_RECEIVABLE');
  await account('2000', 'LIABILITY', 'ACCOUNTS_PAYABLE'); const revenue = await account('4000', 'REVENUE'); const expense = await account('6000', 'EXPENSE');
  const customer = await api('/customers', 'POST', { name: 'Client 100%' }, 201); const vendor = await api('/vendors', 'POST', { name: 'Supplier' }, 201);
  const invoices = [];
  for (const amount of ['10.10', '100.00', '2.00']) invoices.push(await api('/invoices', 'POST', { customerId: customer.id, date: '2026-02-01', dueDate: '2026-03-01', lines: [{ description: 'Work', quantity: '1', unitPrice: amount, accountId: revenue.id }] }, 201));
  await api('/invoices/' + invoices[1].id + '/post', 'POST', { receivableAccountId: ar.id });
  await api('/invoices/' + invoices[1].id + '/record-payment', 'POST', { paymentAccountId: cash.id, amount: '40', date: '2026-02-02', requestId: randomUUID() });
  const sorted = await api('/invoices?page=1&pageSize=2&sort=total&direction=asc');
  assert.equal(sorted.total, 3); assert.equal(sorted.totalPages, 2); assert.deepEqual(sorted.items.map(row => row.total), ['2.00', '10.10']);
  assert.equal((await api('/invoices?page=2&pageSize=2&sort=total&direction=asc')).items[0].balanceDue, '60.00');
  assert.equal((await api('/invoices?page=1&view=overdue&today=2026-03-02')).total, 1);
  assert.equal((await api('/invoices?page=1&view=overdue&today=2026-03-01')).total, 0);
  assert.equal((await api('/invoices?page=1&q=100%25')).total, 3); assert.equal((await api('/invoices?page=1&q=100_')).total, 0);
  assert.equal((await api('/invoices?page=1&startDate=2026-02-02')).total, 0); assert.ok(Array.isArray(await api('/invoices')));
  for (const query of ['pageSize=101', 'sort=unknown', 'direction=wrong', 'page=0', 'startDate=2026-02-30', 'startDate=2026-03-01&endDate=2026-02-01']) await api('/invoices?page=1&' + query, 'GET', undefined, 400);
  const bill = await api('/bills', 'POST', { vendorId: vendor.id, vendorInvoiceNo: 'SUPP-001', date: '2026-02-01', dueDate: '2026-03-01', lines: [{ description: 'Supplies', quantity: '1', unitPrice: '80', accountId: expense.id }] }, 201);
  await api('/bills/' + bill.id + '/receive', 'POST'); await api('/bills/' + bill.id + '/pay', 'POST', { paymentAccountId: cash.id, amount: '30', date: '2026-02-02', requestId: randomUUID() });
  assert.equal((await api('/bills?page=1&q=SUPP-001&view=open')).items[0].balanceDue, '50.00');
  assert.equal((await api('/bills?page=1&view=due-soon&today=2026-02-22')).total, 1); assert.deepEqual((await api('/receipts?page=1')).items, []);
  const other = await fixture(); assert.equal((await other.api('/invoices?page=1')).total, 0); assert.equal((await other.api('/bills?page=1')).total, 0);
});
test('account activity ties opening and running balances to posted reports across pages and sources', options, async () => {
  const { api, account } = await fixture(); const cash = await account('1000', 'ASSET', 'BANK'); const ar = await account('1100', 'ASSET', 'ACCOUNTS_RECEIVABLE');
  const equity = await account('3000', 'EQUITY'); const revenue = await account('4000', 'REVENUE');
  async function journal(date, amount, post = true) {
    const entry = await api('/journal-entries', 'POST', { date, description: 'Opening fixture', journalLines: [{ accountId: cash.id, debit: amount }, { accountId: equity.id, credit: amount }] }, 201);
    if (post) await api('/journal-entries/' + entry.id + '/post', 'POST'); return entry;
  }
  await journal('2026-01-01', '100'); await journal('2026-02-01', '20'); await journal('2026-02-02', '30'); await journal('2026-02-03', '999', false); await journal('2026-03-01', '500');
  const query = '/reports/account-activity?accountId=' + cash.id + '&startDate=2026-02-01&endDate=2026-02-28&pageSize=1';
  const first = await api(query); const second = await api(query + '&page=2');
  assert.equal(first.opening, '100.00'); assert.equal(first.debit, '50.00'); assert.equal(first.credit, '0.00'); assert.equal(first.closing, '150.00'); assert.equal(first.total, 2);
  assert.equal(first.items[0].balance, '120.00'); assert.equal(second.items[0].balance, '150.00'); assert.equal((await api(query + '&page=99')).total, 2);
  const tb = await api('/reports/trial-balance?asOf=2026-02-28'); assert.equal(tb.rows.find(row => row.accountId === cash.id).debitTotal, first.closing);
  const other = await fixture(); await other.api('/reports/account-activity?accountId=' + cash.id, 'GET', undefined, 404);
  await api('/reports/account-activity?accountId=' + cash.id + '&startDate=bad', 'GET', undefined, 400);
  const customer = await api('/customers', 'POST', { name: 'Client' }, 201);
  const invoice = await api('/invoices', 'POST', { customerId: customer.id, date: '2026-02-01', dueDate: '2026-03-01', lines: [{ description: 'Work', quantity: '1', unitPrice: '5.10', accountId: revenue.id }] }, 201);
  await api('/invoices/' + invoice.id + '/post', 'POST', { receivableAccountId: ar.id });
  const activity = await api('/reports/account-activity?accountId=' + revenue.id + '&endDate=2026-02-28');
  assert.equal(activity.closing, '-5.10'); assert.equal(activity.items[0].sources[0].href, '/sales/invoices/' + invoice.id);
  await api('/invoices/' + invoice.id + '/void', 'POST', { date: '2026-02-02', reason:'Reviewed cancellation supported by fixture evidence' });
  const corrected = await api('/reports/account-activity?accountId=' + revenue.id + '&endDate=2026-02-28');
  assert.equal(corrected.closing, '0.00'); assert.equal(corrected.items.length, 2); assert.ok(corrected.items[1].reversalOfId);
  assert.equal(corrected.items[1].sources[0].href, '/sales/invoices/' + invoice.id);
});
