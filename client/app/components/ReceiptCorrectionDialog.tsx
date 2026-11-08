'use client';
import { useRef, useState, type FormEvent } from 'react';
import { API_BASE_URL, apiFetch, type Receipt } from '@/lib/api';
import { localDay } from '@/lib/money';
import AccountingDialog from './AccountingDialog';
export default function ReceiptCorrectionDialog({ receipt, onDismiss, onComplete }: { receipt: Receipt; onDismiss: () => void; onComplete: (receipt: Receipt, message: string) => void }) {
  const key = useRef(crypto.randomUUID()); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const response = await apiFetch(API_BASE_URL + '/api/receipts/' + receipt.id + '/correct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: key.current, date: String(data.get('date')), reason: String(data.get('reason')), createReplacement: data.has('replacement') }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Correction could not save.');
      onComplete(result, receipt.journalEntryId ? 'Purchase reversed with its original evidence preserved.' : 'Evidence superseded; no financial posting changed.'); onDismiss();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Correction could not save.'); }
    finally { setBusy(false); }
  }
  return <AccountingDialog title={receipt.journalEntryId ? 'Correct a posted purchase' : 'Correct reviewed evidence'} busy={busy} onDismiss={onDismiss}><form className="grid gap-4" onSubmit={submit}>
    <p className="text-sm text-slate-600">{receipt.journalEntryId ? 'Creates an equal and opposite journal on the selected open date. The original purchase, image, and reconciliation evidence remain in history.' : 'Retains the original bill attachment as superseded evidence. A replacement draft lets you review the correct bill link without booking another expense.'}</p>
    <label className="grid gap-1.5 text-sm font-semibold">Correction date<input className="workspace-field" type="date" name="date" defaultValue={localDay()} required /></label>
    <label className="grid gap-1.5 text-sm font-semibold">Reason<textarea className="workspace-field min-h-24" name="reason" minLength={5} maxLength={1000} required /></label>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="replacement" defaultChecked />Create a replacement draft using this document</label>
    <p className="text-xs text-slate-600">A replacement stays unposted until you review and confirm it. Use an open date after any verified statement; unmatch an in-progress bank match first.</p>
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    <button className="workspace-primary" disabled={busy}>{busy ? 'Saving correction…' : receipt.journalEntryId ? 'Reverse purchase and retain history' : 'Supersede reviewed evidence'}</button>
  </form></AccountingDialog>;
}
