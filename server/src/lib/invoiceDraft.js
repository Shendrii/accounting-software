import { Decimal, LedgerError, decimalInput, decimalSum, ledgerAccounts, ledgerDate } from './ledger.js';
import { taxCode, invoiceDetails } from './tax.js';
import { audit } from './audit.js';

async function generateInvoiceNo(tx, workspaceId) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = 'INV-' + now.getFullYear() + month + '-';
  const last = await tx.invoice.findFirst({
    where: { workspaceId, invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: 'desc' },
  });
  const seq = last ? parseInt(last.invoiceNo.split('-')[2], 10) + 1 : 1;
  return prefix + String(seq).padStart(4, '0');
}

export async function checkCustomer(tx, workspaceId, id) {
  const customer = typeof id === 'string' && await tx.customer.findFirst({ where: { id, workspaceId } });
  if (!customer || !customer.isActive) throw new LedgerError('Choose an active customer from this workspace.');
}

export async function draftLines(tx, workspaceId, input) {
  if (!Array.isArray(input) || input.length === 0) throw new LedgerError('Enter at least one invoice line.');
  const lines = input.map(line => {
    if (typeof line?.description !== 'string' || !line.description.trim()) {
      throw new LedgerError('Enter a description for each line.');
    }
    const quantity = decimalInput(line.quantity, 'Quantity', 4);
    const unitPrice = decimalInput(line.unitPrice, 'Unit price');
    if (quantity.isZero()) throw new LedgerError('Quantity must be greater than zero.');
    const amount = quantity.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      description: line.description.trim(), quantity, unitPrice,
      amount: decimalInput(amount, 'Line amount'), accountId: line.accountId || null,
    };
  });
  const accountIds = lines.map(line => line.accountId).filter(Boolean);
  const accounts = await ledgerAccounts(tx, workspaceId, accountIds);
  if ([...accounts.values()].some(account => account.type !== 'REVENUE')) {
    throw new LedgerError('Choose revenue accounts for invoice lines.');
  }
  return lines;
}

export function totals(subtotal, tax) {
  const total = decimalInput(subtotal.plus(tax), 'Invoice total');
  if (total.isZero()) throw new LedgerError('Invoice total must be greater than zero.');
  return { subtotal, tax, total };
}

export async function createDraftInvoice(tx, workspaceId, input, include = { lines: true }) {
  const { customerId, date, dueDate, notes, tax } = input;
  const invoiceDate = ledgerDate(date, 'Invoice date'), due = ledgerDate(dueDate, 'Due date');
  if (due < invoiceDate) throw new LedgerError('Due date cannot precede the invoice date.');
  await checkCustomer(tx, workspaceId, customerId);
  const code = await taxCode(tx, workspaceId, input.taxCodeId, 'OUTPUT', invoiceDate);
  const taxAmount = decimalInput(tax ?? 0, 'Tax');
  if (code?.purpose === 'EXEMPT' && taxAmount.gt(0)) throw new LedgerError('An exempt tax code cannot have a tax amount.');
  const lines = await draftLines(tx, workspaceId, input.lines);
  const created = await tx.invoice.create({ data: {
    workspaceId, invoiceNo: await generateInvoiceNo(tx, workspaceId), customerId,
    date: invoiceDate, dueDate: due, notes, taxCodeId: code?.id,
    invoiceDetails: invoiceDetails(input.invoiceDetails), remindersEnabled: input.remindersEnabled === true,
    ...totals(decimalSum(lines.map(line => line.amount)), taxAmount), lines: { create: lines },
  }, include });
  await audit(tx, workspaceId, 'INVOICE_DRAFT_CREATED', created.id, { after: created });
  return created;
}
