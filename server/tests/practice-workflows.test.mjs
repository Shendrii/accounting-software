import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { reportCsv, reportPdf } from '../src/lib/reportExports.js';

const root = process.env.ACCOUNTING_TEST_API;
const options = { skip: !root && 'Use the disposable localhost readiness runner.' };
async function fixture(label = 'Practice fixture') {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(root).hostname));
  const response = await fetch(root + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: label, email: randomUUID() + '@example.test', password: 'disposable-practice-fixture' }) });
  assert.equal(response.status, 201); const session = await response.json();
  const raw = (path, method = 'GET', body, workspaceId = session.workspace.id) => fetch(root + '/api' + path, { method, headers: { Authorization: 'Bearer ' + session.token, 'x-workspace-id': workspaceId, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const api = async (path, method = 'GET', body, status = 200, workspaceId) => { const res = await raw(path, method, body, workspaceId); const data = await res.json(); assert.equal(res.status, status, path + ': ' + JSON.stringify(data)); return data; };
  const customer = await api('/customers', 'POST', { name: label + ' customer', email: randomUUID() + '@example.test' }, 201);
  const account = (code, name, type, role) => api('/accounts', 'POST', { code, name, type, role }, 201);
  const ar = await account('1100', 'Receivables', 'ASSET', 'ACCOUNTS_RECEIVABLE'), revenue = await account('4000', 'Service revenue', 'REVENUE', 'GENERAL'), bank = await account('1010', 'Bank', 'ASSET', 'BANK');
  async function invoice(amount = '25.10', date = '2022-03-01', dueDate = '2022-03-11') {
    return api('/invoices', 'POST', { customerId: customer.id, date, dueDate, lines: [{ description: 'Monthly website service', quantity: '1', unitPrice: amount, accountId: revenue.id }] }, 201);
  }
  const post = row => api('/invoices/' + row.id + '/post', 'POST', { receivableAccountId: ar.id });
  const pay = (row, amount) => api('/invoices/' + row.id + '/record-payment', 'POST', { amount, paymentAccountId: bank.id, date: '2022-03-12', requestId: randomUUID() });
  return { session, raw, api, customer, ar, revenue, bank, invoice, post, pay };
}

test('report CSV keeps exact money and neutralizes formula cells; PDF continues long descriptions', async () => {
  const report = { title: 'Synthetic report', period: '2022-03-01 through 2022-03-31', sections: [{ title: 'Detail', columns: ['Description', 'Amount'], numeric: [1], rows: [['=HYPERLINK("unsafe")', '-12.34'], ['Long evidence description '.repeat(350), '0.01']] }] };
  const workspace = { id: 'synthetic', name: 'Synthetic client', currency: 'PHP' };
  const csv = reportCsv([report], workspace, '2026-11-12T00:00:00.000Z'); assert.ok(csv.includes('"\'=HYPERLINK(')); assert.ok(csv.includes('"-12.34"')); assert.ok(csv.includes('PHP'));
  const pdf = await reportPdf([report], workspace, '2026-11-12T00:00:00.000Z'); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 3000);
  const single=await reportPdf([{...report,sections:[{...report.sections[0],rows:[['One row','12.34']]}]}],workspace,'2026-11-12T00:00:00.000Z'); assert.equal((single.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1,'Footers must not create extra blank pages.');
});

test('complete aging, statements, ledger and PDF pack retain all pages, cutoff and control differences', options, async () => {
  const f = await fixture('Complete report client'); const rows = [];
  for (let i = 0; i < 130; i++) { const row = await f.invoice('10.13'); await f.post(row); rows.push(row); }
  await f.pay(rows[0], '3.01');
  const paged = await f.api('/reports/aging?asOf=2022-03-31&pageSize=25'); assert.equal(paged.items.length, 25); assert.equal(paged.total, 130); assert.equal(paged.totals.net, '1313.89');
  const exportPath = '/reports/export?report=aging&asOf=2022-03-31&format=csv&page=3&pageSize=1';
  const response = await f.raw(exportPath); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/); const csv = await response.text();
  for (const row of rows) assert.ok(csv.includes(row.invoiceNo), 'Every open invoice must export, independently of page filters.'); assert.ok(csv.includes('"7.12"')); assert.ok(csv.includes('"1313.89"'));
  const pl = await f.api('/reports/profit-loss?startDate=2022-03-01&endDate=2022-03-31'); assert.equal(pl.netIncome, '1316.90');
  const plCsv = await (await f.raw('/reports/export?report=profit-loss&format=csv&startDate=2022-03-01&endDate=2022-03-31')).text(); assert.ok(plCsv.includes(pl.netIncome));
  const ledgerResponse = await f.raw('/reports/export?report=general-ledger&format=csv&startDate=2022-03-01&endDate=2022-03-31'); assert.equal(ledgerResponse.status,200); const ledger = await ledgerResponse.text(); assert.ok(ledger.includes(rows[129].invoiceNo)); assert.ok(ledger.includes('1313.89'));
  const statement = await (await f.raw('/reports/export?report=statement&format=csv&kind=AR&partyId=' + f.customer.id + '&asOf=2022-03-31')).text(); assert.ok(statement.includes(rows[129].invoiceNo)); assert.ok(statement.includes('Closing AR/AP balance')); assert.ok(statement.includes('1313.89'));
  const before = await (await f.raw('/reports/export?report=aging&format=csv&asOf=2022-02-28')).text(); assert.ok(!before.includes(rows[0].invoiceNo));
  const pdfResponse = await f.raw('/reports/export?report=pack&format=pdf&startDate=2022-03-01&endDate=2022-03-31'); assert.equal(pdfResponse.status, 200); assert.match(pdfResponse.headers.get('content-type'), /application\/pdf/);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer()); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); await mkdir('/private/tmp/accountrix-practice-qa', { recursive: true }); await writeFile('/private/tmp/accountrix-practice-qa/month-end-pack.pdf', pdf);
  const other = await fixture('Other report client'); await f.api(exportPath, 'GET', undefined, 403, other.session.workspace.id);
  await f.api('/reports/export?report=statement&kind=AR&partyId=' + other.customer.id + '&asOf=2022-03-31', 'GET', undefined, 404);
  await f.api('/reports/export?report=general-ledger&startDate=2022-03-31&endDate=2022-03-01', 'GET', undefined, 400);
});

test('recurring invoices preserve month-end and terms, create drafts once, and roll back invalid templates', options, async () => {
  const f = await fixture('Recurring invoice client'), row = await f.invoice('25.10', '2026-01-01', '2026-01-11');
  await f.api('/recurring/invoices/' + row.id + '/schedule', 'PUT', { isRecurring: true, recurrenceInterval: 'monthly', recurrenceAnchorDay: 31, nextDueDate: '2026-01-31' });
  const input = { kind: 'invoice', requestId: randomUUID() }; const [a, b] = await Promise.all([f.api('/recurring/run', 'POST', input), f.api('/recurring/run', 'POST', input)]);
  assert.equal(a.created, 1); assert.equal(a.instances[0].id, b.instances[0].id);
  const draft = await f.api('/invoices/' + a.instances[0].id); assert.equal(draft.status, 'DRAFT'); assert.equal(draft.postingEntryId, null); assert.equal(draft.date.slice(0, 10), '2026-01-31'); assert.equal(draft.dueDate.slice(0, 10), '2026-02-10'); assert.equal(draft.total, '25.1'); assert.equal(draft.lines[0].accountId, f.revenue.id);
  const templates = await f.api('/recurring/invoices'); assert.equal(templates.total, 1); assert.deepEqual(templates.items[0].nextOccurrences, ['2026-02-28', '2026-03-31', '2026-04-30']); assert.equal((await f.api('/journal-entries')).length, 0);
  await f.api('/customers/' + f.customer.id, 'PUT', { isActive: false });
  const retry = { kind: 'invoice', requestId: randomUUID() }; await f.api('/recurring/run', 'POST', retry, 400); assert.equal((await f.api('/invoices/' + row.id)).nextDueDate.slice(0, 10), '2026-02-28');
  await f.api('/customers/' + f.customer.id, 'PUT', { isActive: true }); const next = await f.api('/recurring/run', 'POST', retry); assert.equal((await f.api('/invoices/' + next.instances[0].id)).date.slice(0, 10), '2026-02-28');
  await f.api('/recurring/invoices/' + row.id + '/schedule', 'PUT', { isRecurring: false }); assert.equal((await f.api('/recurring/invoices')).total, 0);
});

test('reviewed reminders recheck balances, send once on concurrent retry and retain ambiguous attempts', options, async () => {
  const f = await fixture('Reminder client'), row = await f.invoice('25.10'); await f.post(row); await f.pay(row, '5.00');
  await f.api('/invoice-reminders/' + row.id, 'PUT', { enabled: true }); const preview = await f.api('/invoice-reminders/' + row.id); assert.equal(preview.eligible, true); assert.equal(preview.balance, '20.10'); assert.ok(preview.message.includes('USD 20.10'));
  await f.pay(row, '1.00'); await f.api('/invoice-reminders/' + row.id + '/send', 'POST', { requestId: randomUUID(), snapshot: preview.snapshot }, 409);
  const fresh = await f.api('/invoice-reminders/' + row.id); assert.equal(fresh.balance, '19.10'); const input = { requestId: randomUUID(), snapshot: fresh.snapshot };
  const [a, b] = await Promise.all([f.api('/invoice-reminders/' + row.id + '/send', 'POST', input), f.api('/invoice-reminders/' + row.id + '/send', 'POST', input)]); assert.equal(a.record.id, b.record.id);
  const mail = await (await fetch(root + '/__test/mail')).json(); assert.equal(mail.filter(m => m.purpose === 'INVOICE_REMINDER' && m.to === f.customer.email).length, 1);
  assert.equal((await f.api('/invoice-reminders')).total, 0); const after = await f.api('/invoice-reminders/' + row.id); assert.equal(after.eligible, false); assert.equal(after.history[0].status, 'SENT');
  await f.api('/invoice-reminders/' + row.id + '/send', 'POST', { requestId: randomUUID(), snapshot: fresh.snapshot }, 409);
  await f.api('/customers/' + f.customer.id, 'PUT', { email: 'unconfirmed@example.test' }); const second = await f.invoice(); await f.post(second); await f.api('/invoice-reminders/' + second.id, 'PUT', { enabled: true }); const uncertain = await f.api('/invoice-reminders/' + second.id); const failed = { requestId: randomUUID(), snapshot: uncertain.snapshot };
  await f.api('/invoice-reminders/' + second.id + '/send', 'POST', failed, 502); const replay = await f.api('/invoice-reminders/' + second.id + '/send', 'POST', failed); assert.equal(replay.record.status, 'UNCONFIRMED'); assert.equal(replay.replayed, true);
  assert.equal((await f.api('/invoice-reminders/' + second.id)).history.length, 1);
  const dueToday = await f.invoice('25.10','2022-03-01',new Date().toISOString().slice(0,10)); await f.post(dueToday); await f.api('/invoice-reminders/'+dueToday.id,'PUT',{enabled:true}); assert.equal((await f.api('/invoice-reminders/'+dueToday.id)).eligible,false,'An invoice due today is not overdue.');
});

test('practice queue uses live memberships, keeps currencies separate, and enforces read-only actions', options, async () => {
  const f = await fixture('Accessible practice client'), outsider = await fixture('Inaccessible practice client'); await f.invoice(); await outsider.invoice();
  const second = await f.api('/workspaces', 'POST', { name: 'Second accessible client' }, 201);
  const queue = await f.api('/practice'); assert.ok(queue.items.some(item => item.workspaceId === f.session.workspace.id && item.type === 'sales')); assert.ok(queue.items.some(item => item.workspaceId === second.id)); assert.ok(!queue.items.some(item => item.workspaceId === outsider.session.workspace.id)); assert.ok(queue.items.every(item => !('balance' in item)));
  const filtered = await f.api('/practice?type=sales&pageSize=1'); assert.equal(filtered.items.length, 1); assert.equal(filtered.items[0].href, '/sales/invoices?status=DRAFT');
  await f.api('/practice?workspaceId=' + outsider.session.workspace.id, 'GET', undefined, 403);
  const url = process.env.ACCOUNTING_TEST_DATABASE_URL; assert.ok(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname)); assert.match(new URL(url).pathname, /^\/(readiness_|accountrix_test_)/);
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await db.workspaceMember.create({ data: { workspaceId: outsider.session.workspace.id, userId: f.session.user.id, role: 'VIEWER' } });
    const visible = await f.api('/practice?workspaceId=' + outsider.session.workspace.id); assert.ok(visible.items.every(item => item.role === 'VIEWER'));
    await f.api('/recurring/run', 'POST', { requestId: randomUUID(), kind: 'invoice' }, 403, outsider.session.workspace.id);
    await db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: outsider.session.workspace.id, userId: f.session.user.id } } });
    await f.api('/practice?workspaceId=' + outsider.session.workspace.id, 'GET', undefined, 403);
  } finally { await db.$disconnect(); }
});
