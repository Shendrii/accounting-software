import { LedgerError, ledgerDate, ledgerTransaction, reversePosting, sendLedgerError } from './ledger.js';
import {audit} from './audit.js';
import { demand } from './permissions.js';
import { refreshSettledDocument } from './settlements.js';

export async function checkCorrectionMatch(tx, workspaceId, entry, date) {
  const group=await tx.bankMatchLine.findFirst({where:{journalLineId:{in:entry.journalLines.map(l=>l.id)},group:{workspaceId}},include:{group:{include:{rows:{include:{bankTransaction:{include:{reconciliation:true}}}}}}}});
  if(group){for(const {bankTransaction:r} of group.group.rows){if(!r.reconciliationId)throw new LedgerError('Unmatch the grouped bank transaction before correcting this posting.',409);if(!r.reconciliation?.proof||date<=ledgerDate(r.reconciliation.statementDate.toISOString()))throw new LedgerError('Use a correction date after the verified grouped statement. Its proof is retained.',409);}}
  const match = await tx.bankTransaction.findFirst({ where: { workspaceId, isMatched: true,
    matchedLineId: { in: entry.journalLines.map(line => line.id) } }, include: { reconciliation: true } });
  if (match && !match.reconciliationId) throw new LedgerError('Unmatch this transaction in Bank reconciliation before correcting it.', 409);
  if (match?.reconciliationId && (!match.reconciliation?.proof || date <= ledgerDate(match.reconciliation.statementDate.toISOString()))) {
    throw new LedgerError('Use a correction date after the verified statement end. Its original reconciliation proof is retained.', 409);
  }
}

export function reversePaymentHandler(kind, loadDocument, result) {
  const invoice = kind === 'invoice';
  return async (req, res) => {
    try {
      demand(req, 'correct');
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
        await checkCorrectionMatch(tx, where.workspaceId, payment.journalEntry, date);
        const reversal = await reversePosting(tx, where.workspaceId, payment.journalEntry, date, 'Payment correction: ' + reason);
        await tx[delegate].update({ where: { id: payment.id }, data: { reversalEntryId: reversal.id, reversalRequestId: key, reversalReason: reason, reversedById: req.user.id, reversedAt: new Date() } });
        await refreshSettledDocument(tx,invoice?'AR':'AP',where.id);
        await audit(tx,where.workspaceId,invoice?'INVOICE_PAYMENT_REVERSED':'BILL_PAYMENT_REVERSED',where.id,{paymentId:payment.id,originalEntryId:payment.journalEntryId,reversalEntryId:reversal.id,amount:payment.amount,date,currency:req.workspace.currency},reason);
        return loadDocument(tx, where);
      });
      res.json(result(document));
    } catch (error) { sendLedgerError(res, error, 'The payment correction could not save.'); }
  };
}
