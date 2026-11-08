import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { demand, assertPermission } from './permissions.js';
import { audit } from './audit.js';
import { Decimal, LedgerError, checkBankPostingDate, decimalInput, decimalSum, ledgerAccounts, ledgerDate, journalLines, updateBalanceCache } from './ledger.js';

export function requireBooksAdmin(req) {
  demand(req, 'manageBooks');
}

export async function hasFinancialRecords(tx, workspaceId) {
  const counts = await Promise.all(['journalEntry', 'invoice', 'bill', 'receipt', 'bankTransaction', 'reconciliation', 'openingBalanceBatch'].map(model => tx[model].count({ where: { workspaceId } })));
  return counts.some(Boolean);
}

export function profileInput(input) {
  const text = (key, max = 120) => {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].trim().length > max) throw new LedgerError('Enter a valid ' + key + '.');
    return input[key].trim();
  };
  const country = text('country', 2);
  const currency = text('currency', 3);
  if (!['PH', 'US'].includes(country) || !['PHP', 'USD'].includes(currency)) throw new LedgerError('Select Philippines or United States, and PHP or USD.');
  const entityType = text('entityType', 40);
  const entities = country === 'PH' ? ['SOLE_PROPRIETOR', 'PARTNERSHIP', 'CORPORATION', 'NONPROFIT'] : ['SOLE_PROPRIETOR', 'PARTNERSHIP', 'LLC', 'CORPORATION', 'NONPROFIT'];
  if (!entities.includes(entityType)) throw new LedgerError('Choose an entity type for this business country.');
  const fiscalYearStartMonth = Number(input.fiscalYearStartMonth);
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) throw new LedgerError('Choose a fiscal year starting month.');
  if (input.accountingBasis !== 'ACCRUAL') throw new LedgerError('This release supports accrual books. Cash-basis reporting is not available yet.');
  const region = country === 'US' ? text('region', 2).toUpperCase() : null;
  if (region && !/^(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/.test(region)) throw new LedgerError('Choose a valid US state or DC.');
  const tax = input.taxSettings ?? {};
  let taxSettings;
  if (country === 'PH') {
    if (!['VAT', 'NON_VAT', 'NOT_CONFIRMED'].includes(tax.vatStatus)) throw new LedgerError('Select the business VAT registration status.');
    if (typeof tax.withholdingAgent !== 'boolean') throw new LedgerError('Confirm the withholding-agent setting.');
    taxSettings = { vatStatus: tax.vatStatus, withholdingAgent: tax.withholdingAgent };
  } else {
    if (typeof tax.salesTaxRegistered !== 'boolean' || typeof tax.contractorTracking !== 'boolean') throw new LedgerError('Confirm the US tax-registration settings.');
    if (typeof tax.salesTaxJurisdictions !== 'string' || tax.salesTaxJurisdictions.length > 500) throw new LedgerError('Enter sales-tax jurisdictions in at most 500 characters.');
    if (tax.salesTaxRegistered && !tax.salesTaxJurisdictions.trim()) throw new LedgerError('List the jurisdictions where the business is registered for sales tax.');
    taxSettings = { salesTaxRegistered: tax.salesTaxRegistered, salesTaxJurisdictions: tax.salesTaxJurisdictions.trim(), contractorTracking: tax.contractorTracking };
  }
  return { legalName: text('legalName'), country, currency, entityType, region, fiscalYearStartMonth,
    booksStartDate: ledgerDate(input.booksStartDate, 'Books starting date'), accountingBasis: 'ACCRUAL', taxSettings };
}

export const starterAccounts = [
  ['1000', 'Cash on hand', 'ASSET', 'CASH'], ['1010', 'Operating bank account', 'ASSET', 'BANK'],
  ['1100', 'Accounts receivable', 'ASSET', 'ACCOUNTS_RECEIVABLE'], ['1200', 'Prepaid expenses', 'ASSET', 'GENERAL'],
  ['1500', 'Equipment', 'ASSET', 'GENERAL'], ['2000', 'Accounts payable', 'LIABILITY', 'ACCOUNTS_PAYABLE'],
  ['2100', 'Credit card', 'LIABILITY', 'CREDIT_CARD'], ['2200', 'Tax payable', 'LIABILITY', 'SALES_TAX'],
  ['3000', 'Owner capital', 'EQUITY', 'GENERAL'], ['3100', 'Retained earnings', 'EQUITY', 'GENERAL'],
  ['4000', 'Service revenue', 'REVENUE', 'GENERAL'], ['6000', 'Operating expenses', 'EXPENSE', 'GENERAL'],
];

function rows(input, key) {
  const raw = input[key + 'Csv'];
  let result = input[key] ?? [];
  if (raw !== undefined && raw !== '') {
    if (typeof raw !== 'string' || raw.length > 1_000_000) throw new LedgerError('Each opening CSV must be under 1 MB.');
    try { result = parse(raw, { columns: true, bom: true, skip_empty_lines: true, trim: true, max_record_size: 10000 }); }
    catch { throw new LedgerError('Check the ' + key + ' CSV headers and quoted values.'); }
  }
  if (!Array.isArray(result) || result.length > 1000) throw new LedgerError('Import at most 1,000 rows per opening schedule.');
  return result;
}

export async function openingPreview(tx, workspaceId, input) {
  const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace.setupCompletedAt || !workspace.booksStartDate) throw new LedgerError('Complete workspace setup before entering opening balances.');
  const asOf = new Date(workspace.booksStartDate); asOf.setUTCDate(asOf.getUTCDate() - 1);
  const accounts = await tx.account.findMany({ where: { workspaceId, isActive: true } });
  const byCode = new Map(accounts.map(account => [account.code, account]));
  const seen = new Set();
  const balances = rows(input, 'balances').map(row => {
    const account = byCode.get(String(row.accountCode ?? ''));
    if (!account || seen.has(account.id)) throw new LedgerError('Each trial-balance row must name a different active account code.');
    seen.add(account.id);
    const debit = decimalInput(row.debit || '0', 'Opening debit'); const credit = decimalInput(row.credit || '0', 'Opening credit');
    if (debit.gt(0) && credit.gt(0)) throw new LedgerError('Enter only a net debit or net credit for each opening account.');
    return { accountId: account.id, accountCode: account.code, accountName: account.name, role: account.role, debit: debit.toFixed(2), credit: credit.toFixed(2) };
  }).filter(row => row.debit !== '0.00' || row.credit !== '0.00');
  const schedules = {};
  for (const kind of ['receivables', 'payables']) {
    const receivable = kind === 'receivables';
    const delegate = receivable ? 'customer' : 'vendor';
    const contacts = await tx[delegate].findMany({ where: { workspaceId }, select: { id: true, name: true, isActive: true } });
    const sourceRows = rows(input, kind);
    const references = sourceRows.map(row => String(row.reference ?? '').trim());
    const existingDocuments = await tx[receivable ? 'invoice' : 'bill'].findMany({ where: { workspaceId, [receivable ? 'invoiceNo' : 'vendorInvoiceNo']: { in: references } },
      select: receivable ? { invoiceNo: true } : { vendorId: true, vendorInvoiceNo: true } });
    const documentKeys = new Set(existingDocuments.map(row => receivable ? row.invoiceNo : row.vendorId + ':' + row.vendorInvoiceNo));
    const refs = new Set();
    schedules[kind] = [];
    for (const row of sourceRows) {
      const partyName = typeof row.partyName === 'string' ? row.partyName.trim() : '';
      const reference = typeof row.reference === 'string' ? row.reference.trim() : '';
      if (!partyName || partyName.length > 160 || !reference || reference.length > 100) throw new LedgerError('Each opening document needs a party name and reference (at most 160 and 100 characters).');
      const candidates = row.partyId ? contacts.filter(contact => contact.id === row.partyId) : contacts.filter(contact => contact.name.toLowerCase() === partyName.toLowerCase());
      if (candidates.length > 1 || row.partyId && !candidates.length || candidates.some(contact => !contact.isActive)) throw new LedgerError('Resolve the inactive or ambiguous contact for ' + partyName + '. Use partyId to identify an existing contact.');
      const account = byCode.get(String(row.accountCode ?? ''));
      if (!account || account.role !== (receivable ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE')) throw new LedgerError('Choose an active AR/AP control account code for each opening document.');
      const date = ledgerDate(row.date, 'Original document date'); const due = ledgerDate(row.dueDate, 'Original due date');
      if (date > asOf || due < date) throw new LedgerError('Opening documents must be dated before the books start, with a due date on or after the document date.');
      const amount = decimalInput(row.amount, 'Outstanding amount');
      if (!amount.gt(0)) throw new LedgerError('Opening documents must have a positive remaining balance. Credits require a reviewed adjustment outside this import.');
      const identity = receivable ? reference : (candidates[0]?.id ?? partyName.toLowerCase()) + ':' + reference;
      if (refs.has(identity)) throw new LedgerError('An opening document reference is repeated.');
      refs.add(identity);
      const existing = documentKeys.has(receivable ? reference : candidates[0]?.id + ':' + reference);
      if (existing) throw new LedgerError('The opening document ' + reference + ' already exists.');
      schedules[kind].push({ partyId: candidates[0]?.id ?? null, partyName: candidates[0]?.name ?? partyName, reference,
        accountId: account.id, accountCode: account.code, date: date.toISOString().slice(0, 10), dueDate: due.toISOString().slice(0, 10), amount: amount.toFixed(2) });
    }
  }
  const debit = decimalSum(balances.map(row => row.debit)); const credit = decimalSum(balances.map(row => row.credit));
  const controls = accounts.filter(account => ['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE'].includes(account.role)).map(account => {
    const row = balances.find(item => item.accountId === account.id);
    const net = new Decimal(row?.debit ?? 0).minus(row?.credit ?? 0).times(account.role === 'ACCOUNTS_RECEIVABLE' ? 1 : -1);
    const support = decimalSum(schedules[account.role === 'ACCOUNTS_RECEIVABLE' ? 'receivables' : 'payables'].filter(item => item.accountId === account.id).map(item => item.amount));
    return { accountId: account.id, accountCode: account.code, accountName: account.name, balance: net.toFixed(2), support: support.toFixed(2), difference: net.minus(support).toFixed(2) };
  });
  const existing = await tx.journalEntry.count({ where: { workspaceId, status: 'POSTED' } });
  if (existing) throw new LedgerError('Opening balances are available only before the first posted entry. Existing books are preserved.', 409);
  return { asOf: asOf.toISOString().slice(0, 10), currency: workspace.currency, balances, ...schedules, controls,
    totals: { debit: debit.toFixed(2), credit: credit.toFixed(2), difference: debit.minus(credit).toFixed(2) },
    canPost: debit.eq(credit) && controls.every(row => row.difference === '0.00') };
}

export const openingFingerprint = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');

export async function postOpening(tx, workspaceId, userId, input) {
  assertPermission('manageBooks');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new LedgerError('A valid opening request ID is required.');
  const fingerprint = openingFingerprint({ balances: rows(input, 'balances'), receivables: rows(input, 'receivables'), payables: rows(input, 'payables') });
  const existing = await tx.openingBalanceBatch.findUnique({ where: { workspaceId } });
  if (existing) {
    if (existing.requestId !== input.requestId || existing.fingerprint !== fingerprint) throw new LedgerError('Opening balances have already been finalized. This request differs from the posted batch.', 409);
    return existing;
  }
  const preview = await openingPreview(tx, workspaceId, input);
  if (!preview.canPost) throw new LedgerError('Opening debits and credits, and every AR/AP supporting schedule, must agree exactly.');
  const batch = await tx.openingBalanceBatch.create({ data: { workspaceId, requestId: input.requestId, fingerprint, asOfDate: ledgerDate(preview.asOf),
    currency: preview.currency, createdById: userId, snapshot: preview } });
  if (!preview.balances.length) { await audit(tx, workspaceId, 'ZERO_OPENING_CONFIRMED', batch.id, { currency: preview.currency, asOf: preview.asOf, totals: preview.totals }); return batch; }
  await ledgerAccounts(tx, workspaceId, preview.balances.map(row => row.accountId));
  const code = 'OPENING-CLEARING';
  if (await tx.account.findFirst({ where: { workspaceId, code } })) throw new LedgerError('The reserved OPENING-CLEARING code is already in use. Rename that unused account before importing.');
  const clearing = await tx.account.create({ data: { workspaceId, code, name: 'Opening balance clearing', type: 'EQUITY', role: 'GENERAL' } });
  const plans = [{ id: randomUUID(), description: 'Opening trial balance', referenceNo: 'opening:' + batch.id,
    lines: preview.balances.map(row => ({ accountId: ['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE'].includes(row.role) ? clearing.id : row.accountId, debit: row.debit, credit: row.credit })) }];
  const documents = { invoice: [], bill: [] }; const documentLines = { invoice: [], bill: [] };
  for (const kind of ['receivables', 'payables']) {
    const invoice = kind === 'receivables'; const delegate = invoice ? 'customer' : 'vendor';
    const contacts = new Map(); const newContacts = [];
    for (const row of preview[kind]) if (!row.partyId && !contacts.has(row.partyName.toLowerCase())) {
      const id = randomUUID(); contacts.set(row.partyName.toLowerCase(), id); newContacts.push({ id, workspaceId, name: row.partyName });
    }
    if (newContacts.length) await tx[delegate].createMany({ data: newContacts });
    for (const [index, row] of preview[kind].entries()) {
      const partyId = row.partyId ?? contacts.get(row.partyName.toLowerCase()); const entryId = randomUUID(); const id = randomUUID();
      plans.push({ id: entryId, description: 'Opening ' + (invoice ? 'receivable: ' : 'payable: ') + row.reference, referenceNo: row.reference,
        lines: invoice ? [{ accountId: row.accountId, debit: row.amount }, { accountId: clearing.id, credit: row.amount }] :
          [{ accountId: clearing.id, debit: row.amount }, { accountId: row.accountId, credit: row.amount }] });
      const document = { id, workspaceId, date: ledgerDate(row.date), dueDate: ledgerDate(row.dueDate), total: new Decimal(row.amount),
        postingEntryId: entryId, isOpeningBalance: true, notes: 'Remaining balance brought forward. This is not a new sale or purchase.' };
      documents[invoice ? 'invoice' : 'bill'].push(invoice ? { ...document, customerId: partyId, invoiceNo: row.reference, status: 'SENT', subtotal: new Decimal(row.amount) } :
        { ...document, vendorId: partyId, billNo: 'OPEN-' + preview.asOf.replaceAll('-', '') + '-' + String(index + 1).padStart(4, '0'), vendorInvoiceNo: row.reference, status: 'RECEIVED' });
      documentLines[invoice ? 'invoice' : 'bill'].push({ [invoice ? 'invoiceId' : 'billId']: id, description: 'Opening outstanding balance', quantity: new Decimal(1), unitPrice: new Decimal(row.amount), amount: new Decimal(row.amount) });
    }
  }
  const allLines = plans.flatMap(plan => journalLines(plan.lines).map(line => ({ ...line, journalEntryId: plan.id })));
  const accountMap = await ledgerAccounts(tx, workspaceId, allLines.map(line => line.accountId));
  await checkBankPostingDate(tx, workspaceId, ledgerDate(preview.asOf), accountMap, true);
  // Bulk inserts keep a reviewed opening batch atomic without one round trip per document.
  await tx.journalEntry.createMany({ data: plans.map(({ lines, ...plan }) => ({ ...plan, workspaceId, date: ledgerDate(preview.asOf), openingBatchId: batch.id, status: 'DRAFT', createdById: userId })) });
  await tx.journalLine.createMany({ data: allLines });
  await tx.journalEntry.updateMany({where:{openingBatchId:batch.id,workspaceId},data:{status:'POSTED',postedById:userId,postedAt:new Date()}});
  for (const kind of ['invoice', 'bill']) if (documents[kind].length) {
    await tx[kind].createMany({ data: documents[kind] });
    await tx[kind + 'Line'].createMany({ data: documentLines[kind] });
  }
  await updateBalanceCache(tx, workspaceId, allLines, accountMap);
  const balance = await tx.journalLine.aggregate({ where: { accountId: clearing.id, journalEntry: { workspaceId, status: 'POSTED' } }, _sum: { debit: true, credit: true } });
  if (!new Decimal(balance._sum.debit ?? 0).eq(balance._sum.credit ?? 0)) throw new LedgerError('Opening clearing did not return to zero. No entries were posted.');
  await audit(tx, workspaceId, 'OPENING_BALANCES_POSTED', batch.id, { currency: preview.currency, asOf: preview.asOf, totals: preview.totals, entries: plans.map(plan => plan.id) });
  return batch;
}
