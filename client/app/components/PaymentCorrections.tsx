'use client';
import { useRef, useState, type FormEvent } from 'react';
import { reverseRecordedPayment, type PaymentHistory } from '@/lib/books-api';
import { localDay } from '@/lib/money';
import { useMoney } from '@/lib/use-money';
import { useWorkspaces } from './WorkspaceProvider';
import AccountingDialog from './AccountingDialog';
import { WorkspaceNotice } from './WorkspaceUI';

export function PaymentCorrections({ kind, documentId, payments, onCorrected, onInspect }: { kind: 'invoice' | 'bill'; documentId: string; payments: PaymentHistory[]; onCorrected: () => void | Promise<void>; onInspect?: (paymentId: string) => void }) {
  const { active } = useWorkspaces(); const money = useMoney();
  const [selected, setSelected] = useState<PaymentHistory | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useRef<{ signature: string; id: string } | null>(null);
  const canCorrect = active?.role === 'OWNER' || active?.role === 'ADMIN';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy) return;
    const values = new FormData(event.currentTarget); const date = String(values.get('date')); const reason = String(values.get('reason')).trim();
    const signature = JSON.stringify([selected.id, date, reason]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try { await reverseRecordedPayment(kind, documentId, selected.id, { date, reason, requestId: request.current.id }); await onCorrected(); setSelected(null); request.current = null; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The payment could not be corrected.'); }
    finally { setBusy(false); }
  }
  if (!payments.length) return null;
  return <div className="border-t border-slate-200 px-4 py-3 text-sm">
    <p className="mt-1 text-xs text-slate-600">Original payments stay in the history. Reversed amounts no longer reduce the balance due.</p>
    <ul className="mt-2 divide-y divide-slate-200">{payments.map(payment => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p>{payment.journalEntry.date.slice(0, 10)} · <span className="tabular-nums">{money.format(payment.amount)}</span></p>{onInspect && <button type="button" className="workspace-text-action" onClick={() => onInspect(payment.id)}>View original posting</button>}{payment.reversalEntryId && <p className="mt-1 text-xs text-slate-600">Reversed {payment.reversalEntry?.date.slice(0, 10)} · {payment.reversalReason}</p>}</div>{payment.reversalEntryId ? <span className="font-semibold">Reversed</span> : canCorrect && <button type="button" className="workspace-text-action" onClick={() => { setSelected(payment); setError(''); request.current = null; }}>Correct payment</button>}</li>)}</ul>
    {selected && <AccountingDialog title="Reverse an incorrect recorded payment" busy={busy} onDismiss={() => setSelected(null)}><form className="space-y-4" onSubmit={submit}>
      <p className="text-sm">Reverse the recorded {money.format(selected.amount)} payment, then record the correct payment from the {kind}. This changes the books and does not send or refund money.</p>
      <label className="grid gap-1.5 text-sm font-semibold">Correction date<input type="date" name="date" className="workspace-field" min={selected.journalEntry.date.slice(0, 10)} defaultValue={localDay() < selected.journalEntry.date.slice(0, 10) ? selected.journalEntry.date.slice(0, 10) : localDay()} required disabled={busy} /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Reason<textarea className="workspace-field min-h-24" name="reason" minLength={5} maxLength={500} required disabled={busy} placeholder="Explain what was recorded incorrectly and what should replace it." /></label>
      <p className="text-xs text-slate-600">Bank-matched payments must be unmatched first. A payment in a completed reconciliation cannot be changed here.</p>
      {error && <WorkspaceNotice title="Payment correction could not save">{error}</WorkspaceNotice>}
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className="workspace-button" onClick={() => setSelected(null)} disabled={busy}>Cancel</button><button type="submit" className="workspace-primary" disabled={busy}>{busy ? 'Recording reversal…' : 'Reverse recorded payment'}</button></div>
    </form></AccountingDialog>}
  </div>;
}
