'use client';

import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, Loader2, Search, Upload, X } from 'lucide-react';
import { approveReceipt, attachReceiptToBill, createBillFromReceipt, getAccounts, getBills, getReceipts, getVendors, rejectReceipt, updateReceipt, uploadReceipt, type Account, type Bill, type Receipt, type ReceiptExtractedData, type Vendor } from '@/lib/api';
import { isPaymentAccount, isPurchaseAccount } from '@/lib/account-roles';
import { decimalUnits, formatUsd } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
import ReceiptImage from '@/app/components/ReceiptImage';
import { WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

function validDate(value: string) {
  const date = new Date(value + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function status(receipt: Receipt) {
  if (receipt.status === 'REJECTED') return 'Rejected';
  if (receipt.status === 'APPROVED') return receipt.billId ? 'Attached to bill' : 'Posted expense';
  return validDate(receipt.extractedData.invoiceDate || receipt.extractedData.date || '') ? 'Needs review' : 'Check date';
}
async function loadLookups() {
  const [accounts, vendors, bills] = await Promise.all([getAccounts(), getVendors({ isActive: true }), getBills()]);
  return { accounts: accounts.filter(account => account.isActive), vendors, bills: bills.filter(bill => bill.status !== 'VOID') };
}

export function ReceiptsPage() {
  const [view, setView] = useState<'PENDING' | 'all'>('PENDING');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ text: string; billId?: string | null } | null>(null);
  const loadQueue = useCallback(() => getReceipts(view === 'all' ? undefined : view), [view]);
  const queue = useWorkspaceData(loadQueue);
  const loadReview = useCallback(() => opened ? loadLookups() : Promise.resolve(null), [opened]);
  const lookups = useWorkspaceData(loadReview);
  const receipts = (queue.data ?? []).filter(receipt => [receipt.extractedData.vendor, receipt.extractedData.invoiceNumber, receipt.category]
    .some(value => (value ?? '').toLowerCase().includes(search.toLowerCase())));
  const selected = queue.data?.find(receipt => receipt.id === selectedId);
  async function upload(file: File) {
    setUploading(true); setError(''); setNotice(null);
    try { await uploadReceipt(file); await queue.retry(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload receipt.'); }
    finally { setUploading(false); }
  }
  function completed(receipt: Receipt, text: string) {
    setNotice({ text, billId: receipt.billId }); setSelectedId(null); void queue.retry(); void lookups.retry();
  }
  return <div className="workspace-page"><div className="workspace-content space-y-5">
    <WorkspaceHeading section="Daily work" title="Receipts" description="Review the document, then choose how it should be recorded."
      actions={<a href="#upload-receipt" className="workspace-primary"><Upload className="size-4" aria-hidden="true" />Upload receipt</a>} />
    {error && <WorkspaceNotice title="Upload could not finish">{error}</WorkspaceNotice>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">{notice.text} {notice.billId && <Link href={'/purchases/bills/' + notice.billId} className="font-semibold underline">Open bill</Link>}</div>}
    <section id="upload-receipt" className="workspace-panel scroll-mt-4 p-4 sm:p-5">
      <label className="flex cursor-pointer flex-wrap items-center gap-3">
        <span className="workspace-icon">{uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}</span>
        <span className="min-w-32 flex-1"><span className="block text-sm font-semibold">{uploading ? 'Processing receipt…' : 'Add a receipt image'}</span><span className="text-xs text-slate-600">JPEG, PNG, or WebP · Duplicate images are checked.</span></span>
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose receipt image" disabled={uploading}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }}
          className="max-w-full text-sm file:mr-2 file:min-h-11 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:font-semibold file:text-blue-900" />
      </label>
    </section>
    <nav className="workspace-tabs" aria-label="Receipt views">{(['PENDING', 'all'] as const).map(value => <button key={value} type="button" className="workspace-tab" aria-current={view === value ? 'page' : undefined}
      onClick={() => { setView(value); setSelectedId(null); }}>{value === 'PENDING' ? 'Needs review' : 'All receipts'}</button>)}</nav>
    <label className="relative block"><Search className="absolute left-3 top-3 size-4 text-slate-500" aria-hidden="true" /><span className="sr-only">Search receipts</span>
      <input className="workspace-field pl-9" placeholder="Search vendor, supplier reference, or category…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {queue.error && <WorkspaceNotice title="Receipts could not load" onRetry={queue.retry} />}
    <WorkspacePanel title="Receipt queue" description={queue.loading ? 'Loading…' : receipts.length + ' receipts'}>
      {queue.loading || !receipts.length ? <p className="p-4 text-sm text-slate-600" role="status">{queue.loading ? 'Loading receipts…' : 'No receipts in this view.'}</p> :
        <div className="workspace-table-wrap"><table className="workspace-table">
          <thead><tr><th scope="col">Document</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" className="workspace-number">Total (USD)</th></tr></thead>
          <tbody>{receipts.map(receipt => <tr key={receipt.id}>
            <td><button type="button" className="min-h-11 text-left font-semibold text-blue-800 hover:underline" aria-expanded={selectedId === receipt.id} onClick={() => { setSelectedId(receipt.id); setOpened(true); }}>{receipt.extractedData.vendor || 'Unnamed receipt'}</button><p className="text-xs text-slate-600">{receipt.extractedData.invoiceNumber}</p></td>
            <td>{receipt.extractedData.invoiceDate || receipt.extractedData.date || 'Confirm date'}</td><td><WorkspaceStatus>{status(receipt)}</WorkspaceStatus></td>
            <td className="workspace-number">{formatUsd(receipt.extractedData.total ?? receipt.extractedData.amount ?? 0)}</td>
          </tr>)}</tbody>
        </table></div>}
    </WorkspacePanel>
    {selected && <section aria-label="Receipt review" className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Review document</h2><button className="workspace-button" onClick={() => setSelectedId(null)} type="button"><X className="size-4" aria-hidden="true" />Close review</button></div>
      {lookups.error && <WorkspaceNotice title="Review accounts and vendors could not load" onRetry={lookups.retry} />}
      {lookups.data ? <ReceiptReview key={selected.id + selected.updatedAt} receipt={selected} {...lookups.data} onComplete={completed} /> : <p role="status" className="p-4 text-sm text-slate-600">Loading review details…</p>}
    </section>}
  </div></div>;
}

function ReceiptReview({ receipt, accounts, vendors, bills, onComplete }: { receipt: Receipt; accounts: Account[]; vendors: Vendor[]; bills: Bill[]; onComplete: (receipt: Receipt, text: string) => void }) {
  const original = receipt.extractedData;
  const [data, setData] = useState(() => ({
    vendor: original.vendor ?? '', invoiceNumber: original.invoiceNumber ?? '',
    invoiceDate: validDate(original.invoiceDate || original.date || '') ? original.invoiceDate || original.date || '' : '',
    total: String(original.total ?? original.amount ?? ''), amountPaid: String(original.amountPaid ?? '0'), balanceDue: String(original.balanceDue ?? '0'),
    tax: String(original.tax ?? '0'), tip: String(original.tip ?? '0'),
    items: (original.items ?? []).map(item => ({ description: item.description, amount: String(item.amount) })),
  }));
  const [action, setAction] = useState<'expense' | 'bill' | 'attach'>(() => receipt.billId ? 'attach' : decimalUnits(String(original.balanceDue ?? 0)) > BigInt(0) || decimalUnits(String(original.amountPaid ?? 0)) > BigInt(0) && decimalUnits(String(original.amountPaid ?? 0)) < decimalUnits(String(original.total ?? original.amount ?? 0)) ? 'bill' : 'expense');
  const [vendorId, setVendorId] = useState(receipt.vendorId ?? '');
  const [accountId, setAccountId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [billId, setBillId] = useState(receipt.billId ?? '');
  const [dueDate, setDueDate] = useState(validDate(original.dueDate || '') ? original.dueDate || '' : '');
  const [paidInFull, setPaidInFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const total = decimalUnits(data.total);
  const partial = decimalUnits(data.balanceDue) > BigInt(0) || decimalUnits(data.amountPaid) > BigInt(0) && decimalUnits(data.amountPaid) < total;
  const duplicate = bills.find(bill => bill.vendorId === vendorId && data.invoiceNumber.trim() && bill.vendorInvoiceNo === data.invoiceNumber.trim().toUpperCase());
  const editable = receipt.status === 'PENDING';
  function field(name: keyof Omit<typeof data, 'items'>, label: string, type = 'text', required = false) {
    return <label className="grid gap-1 text-sm font-medium">{label}<input className="workspace-field" type={type} required={required} disabled={busy || !editable}
      {...(type === 'number' ? { min: name === 'total' ? '0.01' : '0', step: '0.01' } : {})} value={data[name]}
      onChange={event => { setData(current => ({ ...current, [name]: event.target.value })); setSaved(false); setPaidInFull(false); }} /></label>;
  }
  async function save() {
    if (!validDate(data.invoiceDate)) throw new Error('Confirm the receipt date from the source image.');
    const extractedData: ReceiptExtractedData = { ...original, ...data, date: data.invoiceDate, amount: data.total };
    return updateReceipt(receipt.id, { extractedData, vendorId: vendorId || null });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await save();
      if (action === 'expense') {
        const result = await approveReceipt(receipt.id, accountId, paymentId, { paidInFull, confirmedTotal: data.total });
        onComplete(result.receipt, 'Paid purchase posted once to the ledger.');
      } else if (action === 'bill') {
        const result = await createBillFromReceipt(receipt.id, { vendorId, accountId, dueDate, confirmedTotal: data.total });
        onComplete(result, 'Draft bill created with this document attached. Review and post it before recording any payment.');
      } else {
        const result = await attachReceiptToBill(receipt.id, { billId, vendorId: vendorId || null, category: receipt.category ?? null });
        onComplete(result, 'Document attached as evidence. No expense or payment was posted.');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not finish review.'); }
    finally { setBusy(false); }
  }
  return <div className="workspace-panel grid items-start overflow-hidden lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
    <ReceiptImage receiptId={receipt.id} />
    <form onSubmit={submit} className="min-w-0 space-y-5 p-4 sm:p-5" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-2"><WorkspaceStatus>{status(receipt)}</WorkspaceStatus>
        {receipt.billId && <Link className="workspace-text-action" href={'/purchases/bills/' + receipt.billId}>Open bill</Link>}
        {receipt.journalEntryId && <Link className="workspace-text-action" href="/ledger?tab=journal">View journal entries</Link>}</div>
      <div><h3 className="font-semibold">Check the source details</h3><p className="mt-1 text-xs text-slate-600">Amounts are in USD. Extracted payment details are evidence, not a recorded payment.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">{field('vendor', 'Vendor shown on document')}{field('invoiceNumber', 'Supplier invoice / receipt number')}
        {field('invoiceDate', 'Confirmed document date', 'date', true)}{field('total', 'Document total (USD)', 'number', action !== 'attach')}
        {field('amountPaid', 'Paid amount shown on document', 'number')}{field('balanceDue', 'Outstanding amount shown on document', 'number')}</div>
      <details className="rounded-lg border border-slate-200 p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">Check line items, tax, and tip</summary>
        <p className="mb-3 text-xs text-slate-600">When items are present, their amounts plus tax and tip must equal the document total.</p>
        <div className="space-y-2">{data.items.map((item, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-end gap-2">
          <label className="grid gap-1 text-xs">Description<input className="workspace-field" value={item.description} disabled={!editable || busy} onChange={event => setData(current => ({ ...current, items: current.items.map((line, i) => i === index ? { ...line, description: event.target.value } : line) }))} /></label>
          <label className="grid gap-1 text-xs">Amount<input className="workspace-field" type="number" min="0" step="0.01" value={item.amount} disabled={!editable || busy} onChange={event => setData(current => ({ ...current, items: current.items.map((line, i) => i === index ? { ...line, amount: event.target.value } : line) }))} /></label>
          {editable && <button type="button" className="workspace-button min-h-11" disabled={busy} aria-label={'Remove receipt item ' + (index + 1)} onClick={() => setData(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}><X className="size-4" aria-hidden="true" /></button>}
        </div>)}</div>
        {editable && <button type="button" className="workspace-button my-3" disabled={busy} onClick={() => setData(current => ({ ...current, items: [...current.items, { description: '', amount: '' }] }))}>Add item</button>}
        <div className="grid gap-3 sm:grid-cols-2">{field('tax', 'Tax shown on document', 'number')}{field('tip', 'Tip shown on document', 'number')}</div>
      </details>
      {editable && <>
        <fieldset className="space-y-2"><legend className="mb-2 font-semibold">How should this be recorded?</legend>
          {([['expense', 'Paid expense or asset', 'Post a purchase that was paid in full.'], ['bill', 'Unpaid or partly paid bill', 'Create a draft bill. Record any payment from the bill after posting.'], ['attach', 'Attach to an existing bill', 'Add evidence without posting another expense or payment.']] as const).map(([value, label, help]) =>
            <label key={value} className={'flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 ' + (action === value ? 'border-blue-600 bg-blue-50' : 'border-slate-200')}>
              <input type="radio" className="mt-1 size-4" name="recording-action" value={value} checked={action === value} disabled={busy} onChange={() => { setAction(value); setError(''); setPaidInFull(false); }} />
              <span><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-slate-600">{help}</span></span>
            </label>)}
        </fieldset>
        <label className="grid gap-1 text-sm font-medium">Vendor record {action === 'bill' ? '(required)' : '(optional)'}
          <select className="workspace-field" required={action === 'bill'} value={vendorId} disabled={busy} onChange={event => { setVendorId(event.target.value); setBillId(''); }}><option value="">Select vendor…</option>{vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
        {action !== 'attach' && <label className="grid gap-1 text-sm font-medium">Expense or asset account
          <select className="workspace-field" required value={accountId} disabled={busy} onChange={event => setAccountId(event.target.value)}><option value="">Select purchase account…</option>{accounts.filter(isPurchaseAccount).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>}
        {action === 'expense' && <>
          {partial && <WorkspaceNotice title="This document has an unpaid balance">Choose the bill workflow, or correct the extracted payment details using the source document.</WorkspaceNotice>}
          <label className="grid gap-1 text-sm font-medium">Paid from<select className="workspace-field" required value={paymentId} disabled={busy} onChange={event => { setPaymentId(event.target.value); setPaidInFull(false); }}><option value="">Select cash, bank, or credit card…</option>{accounts.filter(account => isPaymentAccount(account, true)).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
          <label className="flex min-h-11 items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm"><input type="checkbox" required checked={paidInFull} disabled={busy || partial} onChange={event => setPaidInFull(event.target.checked)} />I confirm {formatUsd(data.total)} was paid in full from this account.</label>
        </>}
        {action === 'bill' && <>
          <label className="grid gap-1 text-sm font-medium">Bill due date<input className="workspace-field" type="date" min={data.invoiceDate} value={dueDate} required disabled={busy} onChange={event => setDueDate(event.target.value)} /></label>
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">Creates a draft for the full {formatUsd(data.total)}. Cash and the ledger are unchanged until you post the bill and record its actual payments.</p>
          {duplicate && <WorkspaceNotice title="This supplier reference already exists">Choose Attach to an existing bill. <Link className="font-semibold underline" href={'/purchases/bills/' + duplicate.id}>Open {duplicate.billNo}</Link></WorkspaceNotice>}
        </>}
        {action === 'attach' && <label className="grid gap-1 text-sm font-medium">Existing bill<select className="workspace-field" value={billId} required disabled={busy} onChange={event => setBillId(event.target.value)}><option value="">Select existing bill…</option>{bills.filter(bill => !vendorId || bill.vendorId === vendorId).map(bill => <option key={bill.id} value={bill.id}>{bill.billNo} · {bill.vendor?.name} · {formatUsd(bill.total)}</option>)}</select></label>}
        <p className="text-xs text-slate-600">Configure account roles in <Link href="/ledger?tab=accounts" className="font-semibold text-blue-800 underline">Chart of accounts</Link>. Need a vendor? <Link href="/purchases/vendors" className="font-semibold text-blue-800 underline">Manage vendors</Link>.</p>
        {error && <WorkspaceNotice title="Review could not finish">{error}</WorkspaceNotice>}
        {saved && <p role="status" className="text-sm text-emerald-800">Details saved. Nothing has been posted.</p>}
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <button type="submit" className="workspace-primary" disabled={busy || action === 'expense' && partial || action === 'bill' && Boolean(duplicate)}><Check className="size-4" aria-hidden="true" />{busy ? 'Saving…' : action === 'expense' ? 'Post paid purchase' : action === 'bill' ? 'Create draft bill' : 'Attach document'}</button>
          <button type="button" className="workspace-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await save(); setSaved(true); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save.'); } finally { setBusy(false); } }}>Save details only</button>
          <button type="button" className="workspace-button text-red-800" disabled={busy} onClick={async () => { setBusy(true); try { onComplete(await rejectReceipt(receipt.id), 'Receipt rejected. Nothing was posted.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reject.'); } finally { setBusy(false); } }}>Reject</button>
        </div>
      </>}
      {!editable && <p className="text-sm text-slate-600">Reviewed documents are read-only.</p>}
    </form>
  </div>;
}

export default function LegacyReceiptsPage() { return <LegacyRedirect to="/inbox" />; }
