import { LedgerError, decimalInput, decimalSum } from './ledger.js';

export function receiptAmounts(data) {
  const total = decimalInput(data?.total ?? data?.amount, 'Confirmed document total');
  if (!total.gt(0)) throw new LedgerError('Confirm a positive document total.');
  const paid = decimalInput(data?.amountPaid ?? 0, 'Amount paid on document');
  const due = decimalInput(data?.balanceDue ?? 0, 'Balance due on document');
  if (paid.gt(total) || due.gt(total) || paid.gt(0) && due.gt(0) && !paid.plus(due).eq(total)) {
    throw new LedgerError('Amount paid and balance due must agree with the document total. Correct the extracted details.');
  }
  const tax = decimalInput(data?.tax ?? 0, 'Document tax');
  const tip = decimalInput(data?.tip ?? 0, 'Document tip');
  if (tax.plus(tip).gt(total)) throw new LedgerError('Tax and tip cannot exceed the document total.');
  const items = Array.isArray(data?.items) ? data.items : [];
  const lines = items.map(item => ({
    description: typeof item?.description === 'string' && item.description.trim() || 'Receipt item',
    amount: decimalInput(item?.amount, 'Receipt line amount'),
  }));
  if (lines.length && !decimalSum(lines.map(line => line.amount)).plus(tax).plus(tip).eq(total)) {
    throw new LedgerError('Receipt items plus tax and tip do not equal the total. Review the source image before continuing.');
  }
  return { total, paid, due, lines, tax, tip };
}

export function confirmReceiptTotal(expected, total) {
  if (!decimalInput(expected, 'Reviewed total').eq(total)) {
    throw new LedgerError('The document total changed. Refresh and review it before continuing.', 409);
  }
}
