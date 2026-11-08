import { Decimal, LedgerError, decimalInput, decimalSum, ledgerAccounts, ledgerDate } from './ledger.js';
import { purchaseAccount } from './accountRoles.js';
import {audit} from './audit.js';
import { scheduleInput } from './recurrence.js';
import {taxDraft,taxCode} from './tax.js';

export function vendorReference(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 160) throw new LedgerError('Enter a supplier invoice number of at most 160 characters.');
  return value.trim().toUpperCase() || null;
}

export async function checkPaidReceiptReference(tx, workspaceId, vendorId, reference, exceptId) {
  if (!vendorId || !reference) return;
  const duplicate = await tx.receipt.findFirst({
    where: { workspaceId, vendorId, ...(exceptId && { id: { not: exceptId } }), status: 'APPROVED', journalEntryId: { not: null },
      extractedData: { path: ['invoiceNumber'], equals: reference } }, select: { id: true },
  });
  if (duplicate) throw new LedgerError('This supplier reference has already been posted as a paid purchase. Open the existing receipt.', 409);
}

async function generateBillNo(tx, workspaceId) {
  const now = new Date();
  const prefix = 'BILL-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + '-';
  const last = await tx.bill.findFirst({ where: { workspaceId, billNo: { startsWith: prefix } }, orderBy: { billNo: 'desc' } });
  return prefix + String(last ? Number(last.billNo.split('-')[2]) + 1 : 1).padStart(4, '0');
}

export async function draftLines(tx, workspaceId, input) {
  if (!Array.isArray(input) || !input.length) throw new LedgerError('Enter at least one bill line.');
  const lines = input.map(line => {
    if (typeof line?.description !== 'string' || !line.description.trim()) throw new LedgerError('Enter a description for every bill line.');
    const quantity = decimalInput(line.quantity, 'Quantity', 4);
    const unitPrice = decimalInput(line.unitPrice, 'Unit price');
    if (quantity.isZero()) throw new LedgerError('Quantity must be greater than zero.');
    return {
      description: line.description.trim(), quantity, unitPrice, accountId: line.accountId || null,
      amount: decimalInput(quantity.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP), 'Line amount'),
    };
  });
  const accounts = await ledgerAccounts(tx, workspaceId, lines.map(line => line.accountId).filter(Boolean));
  if ([...accounts.values()].some(account => !purchaseAccount(account))) {
    throw new LedgerError('Choose an expense or general asset account for bill lines. Cash and control accounts cannot be used here.');
  }
  const total = decimalInput(decimalSum(lines.map(line => line.amount)), 'Bill total');
  if (total.isZero()) throw new LedgerError('Bill total must be greater than zero.');
  return { lines, total };
}

export async function checkVendor(tx, workspaceId, id) {
  if (typeof id !== 'string' || !await tx.vendor.findFirst({ where: { id, workspaceId, isActive: true }, select: { id: true } })) {
    throw new LedgerError('Choose an active vendor from this workspace.');
  }
}

export function checkDates(date, dueDate) {
  if (dueDate < date) throw new LedgerError('The due date cannot precede the bill date.');
}

export async function createDraftBill(tx, workspaceId, input, include) {
  const { vendorId, notes, isRecurring } = input;
  const date = ledgerDate(input.date, 'Bill date');
  const dueDate = ledgerDate(input.dueDate, 'Due date');
  checkDates(date, dueDate);
  if (isRecurring !== undefined && typeof isRecurring !== 'boolean') throw new LedgerError('Confirm whether this bill repeats.');
  const schedule = isRecurring ? scheduleInput(input, date) : { recurrenceInterval: null, recurrenceAnchorDay: null, nextDueDate: null };
  await checkVendor(tx, workspaceId, vendorId);
  const vendorInvoiceNo = vendorReference(input.vendorInvoiceNo);
  await checkPaidReceiptReference(tx, workspaceId, vendorId, vendorInvoiceNo);
  const draft = await draftLines(tx, workspaceId, input.lines);
  const tax=taxDraft(input);const code=await taxCode(tx,workspaceId,tax.taxCodeId,'INPUT',date);
  if(tax.tax.gt(0)&&(!code||code.purpose==='EXEMPT'))throw new LedgerError('Positive recoverable purchase tax needs an active input-tax code. Include nonrecoverable tax in the expense or asset line instead.');
  const created=await tx.bill.create({
    data: {
      workspaceId, vendorId, billNo: await generateBillNo(tx, workspaceId), vendorInvoiceNo,
      date, dueDate, total: draft.total.plus(tax.tax),...tax, notes, isRecurring: Boolean(isRecurring),
      ...schedule,
      lines: { create: draft.lines },
    }, include,
  });
  await audit(tx,workspaceId,'BILL_DRAFT_CREATED',created.id,{after:created});return created;
}
