import { LedgerError, ledgerDate, ledgerTransaction, reversePosting, sendLedgerError } from './ledger.js';
import { requireBooksAdmin } from './workspaceBooks.js';

export function reversePaymentHandler(kind, loadDocument, result) {
  const invoice = kind === 'invoice';
  return async (req, res) => {
    try {
      requireBooksAdmin(req);
      const date = ledgerDate(req.body.date, 'Correction date');
      const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < 5 || reason.length > 500) throw new LedgerError('Enter a correction reason between 5 and 500 characters.');
      const key = req.body.requestId;
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) throw new LedgerError('A valid correction request ID is required.');
      const where = { id: req.params.id, workspaceId: req.workspace.id };
      const document = await ledgerTransaction(async tx => {
        const original = await loadDocument(tx, where);
        const payment = original.payments.find(item => item.id === req.params.paymentId);
        if (!payment) throw new LedgerError('Payment not found in this document.', 404);
        const delegate = invoice ? 'invoicePayment' : 'billPayment';
        if (payment.reversalEntryId) {
          if (payment.reversalRequestId !== key || payment.reversalReason !== reason || payment.reversalEntry.date.getTime() !== date.getTime()) throw new LedgerError('This payment already has a different correction.', 409);
          return original;
        }
        if (original.status === 'VOID' || payment.journalEntry.status !== 'POSTED' || payment.journalEntry.workspaceId !== where.workspaceId) throw new LedgerError('This payment posting could not be verified.', 409);
        if (date < ledgerDate(payment.journalEntry.date.toISOString())) throw new LedgerError('The correction date cannot precede the payment date.');
        const match = await tx.bankTransaction.findFirst({ where: { workspaceId: where.workspaceId, isMatched: true,
          matchedLineId: { in: payment.journalEntry.journalLines.map(line => line.id) } }, select: { reconciliationId: true } });
        if (match) throw new LedgerError(match.reconciliationId ? 'This payment belongs to a completed reconciliation. Its saved proof cannot be rewritten here.' : 'Unmatch this payment in Bank reconciliation before correcting it.', 409);
        const reversal = await reversePosting(tx, where.workspaceId, payment.journalEntry, date, 'Payment correction: ' + reason);
        await tx[delegate].update({ where: { id: payment.id }, data: { reversalEntryId: reversal.id, reversalRequestId: key, reversalReason: reason, reversedById: req.user.id, reversedAt: new Date() } });
        await tx[invoice ? 'invoice' : 'bill'].update({ where, data: { status: invoice ? 'SENT' : 'RECEIVED' } });
        return loadDocument(tx, where);
      });
      res.json(result(document));
    } catch (error) { sendLedgerError(res, error, 'The payment correction could not save.'); }
  };
}
