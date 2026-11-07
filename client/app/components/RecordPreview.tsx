'use client';
import { useCallback } from 'react';
import Link from 'next/link';
import { getInvoice, getBill, type Bill, type Invoice } from '@/lib/api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { formatUsd } from '@/lib/money';
import { billStatus, invoiceStatus, WorkspaceStatus } from './WorkspaceActivity';
import { WorkspaceNotice } from './WorkspaceUI';
import { PostingTable, postedLines } from './PostingTable';
import WorkbenchDrawer from './WorkbenchDrawer';
export default function RecordPreview({ kind, id, returnTo, onClose, previous, next }: {
  kind: 'invoice' | 'bill'; id: string; returnTo: string; onClose: () => void; previous?: () => void; next?: () => void;
}) {
  const load = useCallback<() => Promise<Invoice | Bill>>(() => kind === 'invoice' ? getInvoice(id) : getBill(id), [kind, id]);
  const { data, loading, error, retry } = useWorkspaceData(load);
  return <WorkbenchDrawer title={kind === 'invoice' ? 'Invoice preview' : 'Bill preview'} onClose={onClose}>
    <nav aria-label="Records on this page" className="flex flex-wrap justify-between gap-2"><button type="button" className="workspace-button" disabled={!previous} onClick={previous}>Previous</button><button type="button" className="workspace-button" disabled={!next} onClick={next}>Next</button></nav>
    {loading && <p role="status">Loading record…</p>}{error && <WorkspaceNotice title="Record could not load" onRetry={retry} />}
    {data && <>
      <div><WorkspaceStatus>{kind === 'invoice' ? invoiceStatus(data as Invoice) : billStatus(data as Bill)}</WorkspaceStatus>
        <h3 className="mt-3 text-2xl font-semibold">{'invoiceNo' in data ? data.invoiceNo : data.billNo}</h3>
        <p className="mt-1 text-sm">{'customer' in data ? data.customer?.name : (data as Bill).vendor?.name}</p>
        <p className="mt-2 text-sm text-slate-600">Dated {data.date.slice(0, 10)} · Due {data.dueDate.slice(0, 10)}</p></div>
      <dl className="workbench-balances"><div><dt>Total</dt><dd>{formatUsd(data.total)}</dd></div><div><dt>Paid</dt><dd>{formatUsd(data.amountPaid ?? '0')}</dd></div><div><dt>Balance due</dt><dd>{data.status === 'DRAFT' || data.status === 'VOID' ? '—' : formatUsd(data.balanceDue ?? '0')}</dd></div></dl>
      <section><h3 className="mb-2 font-semibold">Line items</h3><ul className="divide-y divide-slate-200">{data.lines?.map(line => <li key={line.id} className="flex justify-between gap-4 py-3 text-sm"><span>{line.description}<span className="mt-1 block text-xs text-slate-600">{line.account?.name}</span></span><span className="tabular-nums">{formatUsd(line.amount)}</span></li>)}</ul></section>
      <section><h3 className="mb-2 font-semibold">Payments</h3>{data.payments?.length ? <ul className="divide-y divide-slate-200">{data.payments.map(payment => <li key={payment.id} className="flex justify-between gap-3 py-2 text-sm"><span>{payment.journalEntry?.date.slice(0, 10)}</span><span>{formatUsd(payment.amount)}</span></li>)}</ul> : <p className="text-sm text-slate-600">No recorded payments.</p>}</section>
      {data.postingEntry && <details><summary className="min-h-11 cursor-pointer font-semibold">Posted journal</summary><PostingTable lines={postedLines(data.postingEntry)} /></details>}
      <Link className="workspace-primary" href={(kind === 'invoice' ? '/sales/invoices/' : '/purchases/bills/') + id + '?returnTo=' + encodeURIComponent(returnTo)}>Open full record</Link>
      <p className="text-xs text-slate-600">Review, posting, and payment actions are available in the full record.</p>
    </>}
  </WorkbenchDrawer>;
}
