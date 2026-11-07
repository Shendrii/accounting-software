import { Decimal, decimalSum } from './ledger.js';

export function invoiceAmounts(invoice) {
  const total = new Decimal(invoice.total);
  const paid = invoice.status === 'PAID' && !invoice.postingEntryId
    ? total
    : decimalSum(invoice.payments.filter(payment => !payment.reversalEntryId).map(payment => payment.amount));
  return {
    amountPaid: paid.toFixed(2),
    balanceDue: invoice.status === 'VOID' ? '0.00' : total.minus(paid).toFixed(2),
  };
}
