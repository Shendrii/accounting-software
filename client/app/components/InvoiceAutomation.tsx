'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { Invoice } from '@/lib/api';
import { workflowRequest } from '@/lib/practice-api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { useWorkspaces } from './WorkspaceProvider';
import { workspacePermissions } from '@/lib/workspace-permissions';
import { WorkspaceNotice, WorkspacePanel } from './WorkspaceUI';
import RecurringScheduleFields from './RecurringScheduleFields';

type Reminder = { id: string; status: string; createdAt: string; sentAt?: string; recipient: string; balance: string; currency: string };
interface Preview { invoiceId: string; invoiceNo: string; enabled: boolean; eligible: boolean; reason: string; recipient: string; subject: string; message: string; balance: string | null; currency: string; snapshot: string; history: Reminder[] }

export function ReminderReview({ invoiceId, onSent }: { invoiceId: string; onSent?: () => void }) {
  const { active } = useWorkspaces(); const access = workspacePermissions(active);
  const state = useWorkspaceData(useCallback(() => workflowRequest<Preview>('/invoice-reminders/' + invoiceId), [invoiceId]));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  async function enable(enabled: boolean) {
    setBusy(true); setError('');
    try { await workflowRequest('/invoice-reminders/' + invoiceId, { enabled }, 'PUT'); state.retry(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Reminder settings could not save.'); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!state.data || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await workflowRequest<{ record: Reminder }>('/invoice-reminders/' + invoiceId + '/send', { requestId: requestId.current, snapshot: state.data.snapshot });
      setMessage(result.record.status === 'SENT' ? 'Reminder sent. The delivery record is retained below.' : 'A reminder attempt already exists. Check its delivery status below before contacting the customer again.');
      state.retry(); onSent?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Delivery could not be confirmed.'); state.retry(); }
    finally { setBusy(false); }
  }
  const data = state.data;
  return <div className="space-y-4" aria-busy={state.loading || busy}>
    {state.error && <WorkspaceNotice title="Reminder preview could not load" onRetry={state.retry}>{state.errorMessage}</WorkspaceNotice>}
    {state.loading && <p role="status" className="text-sm text-slate-600">Checking the current balance and reminder history…</p>}
    {data && <>
      <p className="break-words text-sm font-semibold">{active?.name} · {data.currency}</p>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={data.enabled} disabled={busy || !access.prepare} onChange={event => void enable(event.target.checked)} />Enable reviewed reminders for {data.invoiceNo}</label>
      <p className="text-sm text-slate-600">The first reminder becomes due after the invoice due date. Further attempts are at least seven days apart. Every email needs a bookkeeper to review and send it.</p>
      {data.eligible ? <div className="space-y-3 border-y border-slate-300 py-4"><dl className="grid gap-2 text-sm"><div><dt className="font-semibold">To</dt><dd className="break-all">{data.recipient}</dd></div><div><dt className="font-semibold">Subject</dt><dd>{data.subject}</dd></div></dl><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{data.message}</p>{access.prepare && <button type="button" className="workspace-primary" disabled={busy} onClick={() => void send()}>{busy ? 'Sending reviewed reminder…' : 'Send reviewed reminder'}</button>}</div> : <p className="text-sm text-slate-600">{data.reason}</p>}
      {data.history.length > 0 && <div className="space-y-2"><h3 className="text-sm font-semibold">Recent reminder history</h3><ul className="divide-y divide-slate-200">{data.history.map(row => <li key={row.id} className="py-3 text-sm"><p>{row.createdAt.slice(0, 10)} · {row.status === 'SENT' ? 'Sent' : row.status === 'SENDING' ? 'Delivery in progress or interrupted — check mailbox' : 'Delivery unconfirmed — check mailbox'}</p><p className="break-all text-xs text-slate-600">{row.recipient} · {row.currency} {row.balance}</p></li>)}</ul><p className="text-xs text-slate-600">Most recent 20 attempts. The complete history remains in the workspace audit trail.</p></div>}
    </>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
  </div>;
}

export function InvoiceScheduleForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const { active } = useWorkspaces();
  const [enabled, setEnabled] = useState(Boolean(invoice.isRecurring));
  const [schedule, setSchedule] = useState({ nextDueDate: invoice.nextDueDate?.slice(0, 10) || '', recurrenceInterval: invoice.recurrenceInterval || 'monthly', recurrenceAnchorDay: invoice.recurrenceAnchorDay || Number(invoice.date.slice(8, 10)) });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await workflowRequest('/recurring/invoices/' + invoice.id + '/schedule', { ...schedule, isRecurring: enabled }, 'PUT'); setMessage('Schedule saved. Due occurrences will create drafts for review.'); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Schedule could not save.'); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-4" onSubmit={submit}>
    <p className="break-words text-sm font-semibold">{active?.name} · {invoice.customer?.name}</p>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />Generate recurring drafts from {invoice.invoiceNo}</label>
    {enabled && <RecurringScheduleFields value={schedule} onChange={setSchedule} disabled={busy} />}
    <p className="text-xs leading-relaxed text-slate-600">Copies the customer, lines, tax amount and payment interval. Review tax validity, dates and amounts before posting each new invoice. Changing the template does not change drafts already created.</p>
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}{message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    <button className="workspace-button w-fit" disabled={busy}>{busy ? 'Saving schedule…' : 'Save invoice schedule'}</button>
  </form>;
}

export default function InvoiceAutomation({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const { active } = useWorkspaces(), access = workspacePermissions(active);
  if (invoice.status === 'VOID') return null;
  return <div className="grid items-start gap-5 xl:grid-cols-2">
    {!invoice.isOpeningBalance && <WorkspacePanel title="Recurring invoices" action={<Link className="workspace-text-action" href="/sales/recurring">Due templates</Link>}><div className="p-4">{access.prepare ? <InvoiceScheduleForm invoice={invoice} onSaved={onSaved} /> : <p className="text-sm">{invoice.isRecurring ? 'Recurring draft schedule enabled.' : 'No recurring draft schedule.'}</p>}</div></WorkspacePanel>}
    <WorkspacePanel title="Payment reminders" action={<Link className="workspace-text-action" href="/sales/reminders">Reminder queue</Link>}><div className="p-4"><ReminderReview key={invoice.id + invoice.balanceDue + invoice.status} invoiceId={invoice.id} /></div></WorkspacePanel>
  </div>;
}
