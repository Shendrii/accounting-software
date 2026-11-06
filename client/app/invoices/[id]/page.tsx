'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, Mail } from 'lucide-react';
import {
  downloadInvoicePdf, getAccounts, getInvoice, postInvoice, recordInvoicePayment,
  sendInvoiceEmail, voidInvoice, type Account, type Invoice, type JournalEntry,
} from '@/lib/api';
import { decimalText, decimalUnits, formatUsd, localDay } from '@/lib/money';
import { toast } from '@/lib/toast';
import AccountingDialog from '@/app/components/AccountingDialog';
import { PostingTable, postedLines, type PostingLine } from '@/app/components/PostingTable';
import { WorkspaceHeading } from '@/app/components/WorkspaceUI';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';

const panel = 'workspace-panel min-w-0 p-4 sm:p-5';
const button = 'workspace-button';
const primary = 'workspace-primary';
const field = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900';
const textLink = 'inline-flex min-h-10 items-center text-sm font-medium text-blue-700 underline decoration-blue-300 underline-offset-4';

type Action = 'post' | 'payment' | 'email' | 'void';
type Modal = { kind: Action } | { kind: 'journal'; entry: JournalEntry };

const formatDate = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));

function AccountSelect({ name, label, accounts }: { name: string; label: string; accounts: Account[] }) {
  return (
    <label className="block text-sm font-medium">{label}
      <select name={name} required defaultValue="" className={field}>
        <option value="">Select an account</option>
        {accounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
      </select>
    </label>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const paymentRequest = useRef<{ payload: string; id: string } | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([getInvoice(id), getAccounts()]).then(([data, options]) => {
      if (!current) return;
      setInvoice(data);
      setAccounts(options.filter(account => account.isActive));
    }).catch((err: Error) => {
      if (current) setError(err.message);
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [id]);

  function open(next: Modal) {
    setError('');
    setModalError('');
    if (next.kind === 'payment') setPaymentAmount(invoice?.balanceDue ?? '');
    setModal(next);
  }

  async function download() {
    if (!invoice) return;
    try {
      const url = URL.createObjectURL(await downloadInvoicePdf(invoice.id));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Invoice-' + invoice.invoiceNo + '.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download the invoice.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoice || !modal || modal.kind === 'journal' || busy) return;
    setBusy(true);
    setModalError('');
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? '');
    try {
      if (modal.kind === 'post') {
        setInvoice(await postInvoice(invoice.id, {
          receivableAccountId: value('receivable'),
          revenueAccountId: value('revenue') || undefined,
          taxAccountId: value('tax') || undefined,
          confirmUnposted: data.has('reviewed'),
        }));
        toast.success('Invoice posted');
      } else if (modal.kind === 'payment') {
        const amount = decimalText(decimalUnits(paymentAmount));
        const payload = { paymentAccountId: value('deposit'), amount, date: value('date') };
        const fingerprint = JSON.stringify([invoice.id, payload]);
        if (paymentRequest.current?.payload !== fingerprint) {
          paymentRequest.current = { payload: fingerprint, id: crypto.randomUUID() };
        }
        const saved = await recordInvoicePayment(invoice.id, { ...payload, requestId: paymentRequest.current.id });
        setInvoice(saved.invoice);
        paymentRequest.current = null;
        toast.success('Payment recorded');
      } else if (modal.kind === 'email') {
        const sent = await sendInvoiceEmail(invoice.id, value('email').trim());
        setInvoice({ ...invoice, emailSentAt: sent.emailSentAt });
        toast.success('Invoice emailed');
      } else {
        setInvoice(await voidInvoice(invoice.id, value('date') || undefined));
        toast.success('Invoice voided');
      }
      setModal(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to save this change.');
    } finally {
      setBusy(false);
    }
  }

  if (!invoice) {
    return (
      <div className="workspace-page grid place-items-center">
        {loading ? <Loader2 className="size-8 animate-spin text-slate-500" aria-label="Loading invoice" /> : (
          <div className="text-center"><p role="alert">{error || 'Invoice not found.'}</p><Link className={textLink} href="/sales/invoices">Back to invoices</Link></div>
        )}
      </div>
    );
  }

  const posted = invoice.postingEntry;
  const isVoid = invoice.status === 'VOID';
  const canPost = !posted && (invoice.status === 'DRAFT' || invoice.status === 'SENT');
  const canPay = Boolean(posted) && invoice.status === 'SENT';
  const canVoid = (invoice.status === 'DRAFT' || invoice.status === 'SENT') && !decimalUnits(invoice.amountPaid);
  const hasTax = decimalUnits(invoice.tax) > BigInt(0);
  const missingRevenue = invoice.lines?.some(line => !line.accountId && decimalUnits(line.amount) > BigInt(0));
  const receivableId = posted?.journalLines.find(line => decimalUnits(line.debit) > BigInt(0))?.accountId;
  const assetAccounts = accounts.filter(account => account.type === 'ASSET');
  const status = isVoid ? 'Void' : invoice.status === 'PAID' ? 'Paid' : invoice.status === 'DRAFT' ? 'Draft'
    : !posted ? 'Awaiting posting' : decimalUnits(invoice.amountPaid) ? 'Partially paid' : 'Open';
  const statusClass = status === 'Paid' ? 'bg-emerald-50 text-emerald-800' : status === 'Partially paid' || status === 'Awaiting posting'
    ? 'bg-amber-50 text-amber-900' : isVoid ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800';
  const preview: PostingLine[] = [
    { label: 'Accounts receivable', debit: invoice.total },
    ...(invoice.lines ?? []).filter(line => decimalUnits(line.amount) > BigInt(0)).map(line => ({ label: line.account?.name ?? 'Revenue account', credit: line.amount })),
    ...(hasTax ? [{ label: 'Sales tax liability', credit: invoice.tax }] : []),
  ];
  const metrics = [
    ['Invoice total', invoice.total],
    ['Paid to date', invoice.amountPaid],
    [invoice.status === 'DRAFT' ? 'Balance when posted' : 'Balance due', invoice.balanceDue],
  ];
  const modalTitle = modal && ({ post: 'Post invoice', payment: 'Record payment', email: 'Send invoice email', void: 'Void invoice', journal: 'Journal entry' }[modal.kind]);
  const minPaymentDay = (posted?.date ?? invoice.date).slice(0, 10);
  const paymentCents = decimalUnits(paymentAmount);
  let submitLabel = modalTitle;
  if (modal?.kind === 'payment' && paymentCents > BigInt(0) && paymentCents <= decimalUnits(invoice.balanceDue)) {
    submitLabel = 'Record ' + formatUsd(decimalText(paymentCents)) + ' payment';
  }

  let fields: ReactNode;
  if (modal?.kind === 'post') {
    fields = <>
      <p className="text-sm text-slate-600">Post {invoice.invoiceNo} on {formatDate(invoice.date)} for {formatUsd(invoice.total)}.</p>
      <AccountSelect name="receivable" label="Accounts receivable" accounts={assetAccounts} />
      {missingRevenue && <AccountSelect name="revenue" label="Revenue account for uncategorized lines" accounts={accounts.filter(account => account.type === 'REVENUE')} />}
      {hasTax && <AccountSelect name="tax" label="Sales tax liability account" accounts={accounts.filter(account => account.type === 'LIABILITY')} />}
      {invoice.status === 'SENT' && <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <input className="mt-1" type="checkbox" name="reviewed" required />
        I checked the ledger and confirmed that this sale has no existing posting.
      </label>}
      {(!assetAccounts.length || (missingRevenue && !accounts.some(account => account.type === 'REVENUE')) ||
        (hasTax && !accounts.some(account => account.type === 'LIABILITY'))) && <p className="text-sm text-slate-600">
          Add the required accounts in the <Link className={textLink} href="/ledger">chart of accounts</Link>.
        </p>}
    </>;
  } else if (modal?.kind === 'payment') {
    fields = <>
      <p className="text-sm text-slate-600">{invoice.invoiceNo} · {formatUsd(invoice.balanceDue)} due</p>
      <label className="block text-sm font-medium">Payment amount (USD)
        <input className={field} type="number" autoFocus min="0.01" max={invoice.balanceDue} step="0.01" required value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">Payment date
        <input className={field} name="date" type="date" required min={minPaymentDay} defaultValue={localDay() < minPaymentDay ? minPaymentDay : localDay()} />
      </label>
      <AccountSelect name="deposit" label="Deposit to" accounts={assetAccounts.filter(account => account.id !== receivableId)} />
    </>;
  } else if (modal?.kind === 'email') {
    fields = <label className="block text-sm font-medium">Recipient email
      <input className={field} name="email" type="email" autoFocus required defaultValue={invoice.customer?.email ?? ''} />
    </label>;
  } else if (modal?.kind === 'void') {
    fields = posted ? <>
      <p className="text-sm text-slate-600">Void {invoice.invoiceNo} and create a reversing entry linked to its original journal.</p>
      <label className="block text-sm font-medium">Reversal date
        <input className={field} name="date" type="date" required min={minPaymentDay} defaultValue={localDay() < minPaymentDay ? minPaymentDay : localDay()} />
      </label>
    </> : <p className="text-sm text-slate-600">Void {invoice.invoiceNo}?</p>;
  }

  return (
    <div className="workspace-page">
      <div className="workspace-content grid gap-4">
        <WorkspaceHeading section="Sales / Invoices" title={invoice.invoiceNo}
          description={<>{invoice.customer?.name ?? 'Customer'} · Invoice date {formatDate(invoice.date)} · Due {formatDate(invoice.dueDate)}</>}
          actions={<>
            {canPost && <button type="button" className={primary} onClick={() => open({ kind: 'post' })}>Post invoice</button>}
            {canPay && <button type="button" className={primary} onClick={() => open({ kind: 'payment' })}>Record payment</button>}
            <button type="button" onClick={download} className={button}><Download className="size-4" aria-hidden="true" /> PDF</button>
            {!isVoid && (posted || invoice.status !== 'DRAFT') && (
              <button type="button" onClick={() => open({ kind: 'email' })} className={button}><Mail className="size-4" aria-hidden="true" /> Send email</button>
            )}
            <Link className={button} href="/sales/invoices"><ArrowLeft className="size-4" aria-hidden="true" />Invoices</Link>
          </>} />
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!posted && invoice.status === 'SENT' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Review this older invoice against the ledger before posting or recording a payment.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3" aria-live="polite">
          {metrics.map(([label, value]) => <div key={label} className="workspace-panel min-w-0 p-3.5 sm:p-4">
            <p className="text-xs text-slate-600 sm:text-sm">{label}</p>
            <p className="mt-2 text-lg font-semibold tracking-tight break-words text-slate-950 tabular-nums sm:text-2xl">{formatUsd(value)}</p>
          </div>)}
        </div>
        <div className="grid items-start gap-3 md:grid-cols-[1.25fr_1fr]">
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Invoice details</h2>
              <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + statusClass}>{status}</span>
            </div>
            <table className="mt-2 w-full text-sm">
              <thead className="border-b border-slate-200 text-slate-600"><tr><th scope="col" className="py-2 text-left font-medium">Line item</th><th scope="col" className="py-2 text-right font-medium">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{invoice.lines?.map(line => (
                <tr key={line.id}><td className="py-2.5 pr-2">{line.description}<p className="text-xs text-slate-600">{line.account?.name}</p></td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums">{formatUsd(line.amount)}</td></tr>
              ))}</tbody>
              <tfoot className="border-t border-slate-200">
                {hasTax && <tr><th scope="row" className="pt-2 text-left font-medium">Tax</th><td className="pt-2 text-right tabular-nums">{formatUsd(invoice.tax)}</td></tr>}
                <tr><th scope="row" className="pt-2 text-left">Total</th><td className="pt-2 text-right font-semibold tabular-nums">{formatUsd(invoice.total)}</td></tr>
              </tfoot>
            </table>
            {invoice.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{invoice.notes}</p>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <p>Delivery · {invoice.emailSentAt ? 'Sent ' + formatDate(invoice.emailSentAt) : invoice.status === 'SENT' && !posted ? 'Marked as sent' : 'Awaiting delivery'}</p>
              {canVoid && <button type="button" className="min-h-10 text-sm font-medium text-red-800 underline underline-offset-4" onClick={() => open({ kind: 'void' })}>Void invoice</button>}
            </div>
          </section>
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">{posted ? 'Posted journal' : canPost ? 'Posting preview' : 'Ledger'}</h2>
              {posted && <button type="button" className={textLink} onClick={() => open({ kind: 'journal', entry: posted })}>View journal</button>}
            </div>
            {posted ? <PostingTable lines={postedLines(posted)} /> : canPost ? <PostingTable lines={preview} /> : (
              <p className="mt-2 text-sm text-slate-600">{isVoid ? 'Invoice voided before posting.' : 'Historical invoice.'}</p>
            )}
          </section>
        </div>
        <section className={panel}>
          <h2 className="font-semibold text-slate-900">Payment history</h2>
          {invoice.payments?.length ? (
            <ul className="mt-2 divide-y divide-slate-100">
              {invoice.payments.map(payment => {
                const deposit = payment.journalEntry.journalLines.find(line => decimalUnits(line.debit) > BigInt(0));
                return <li key={payment.id} className="flex items-center justify-between gap-3 py-2">
                  <div><button type="button" className={textLink} onClick={() => open({ kind: 'journal', entry: payment.journalEntry })}>
                    {formatDate(payment.journalEntry.date)}</button><p className="text-xs text-slate-600">{deposit?.account?.name}</p></div>
                  <strong className="text-sm tabular-nums">{formatUsd(payment.amount)}</strong>
                </li>;
              })}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-600">{invoice.status === 'PAID' ? 'Paid before itemized payment history was available.' : 'No payments recorded.'}</p>}
        </section>

        {modal && <AccountingDialog title={modalTitle ?? ''} busy={busy} onDismiss={() => setModal(null)}>
          {modal.kind === 'journal' ? <>
            <p className="mb-2 text-sm text-slate-600">{modal.entry.description} · {formatDate(modal.entry.date)}</p>
            <PostingTable lines={postedLines(modal.entry)} />
          </> : <form onSubmit={submit} className="grid gap-3">
            {fields}
            {modalError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{modalError}</p>}
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <button type="button" className={button} disabled={busy} onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className={primary} disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
            </div>
          </form>}
        </AccountingDialog>}
      </div>
    </div>
  );
}

export default function LegacyInvoiceDetailPage() {
  return <LegacyRedirect to="/sales/invoices" preserveLastSegment />;
}
