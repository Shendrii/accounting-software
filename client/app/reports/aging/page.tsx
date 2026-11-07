'use client';
import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { getAgingReport } from '@/lib/books-api';
import { localDay } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { useMoney } from '@/lib/use-money';
import { useWorklist, WorklistPagination } from '@/app/components/WorklistControls';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

const bucketLabels: Record<string, string> = { current: 'Current', days1to30: '1–30 days', days31to60: '31–60 days', days61to90: '61–90 days', days91plus: '91+ days', credit: 'Credits' };
function AgingContent() {
  const { params, update } = useWorklist(); const money = useMoney();
  const kind = params.kind === 'payables' ? 'payables' : 'receivables'; const asOf = params.asOf || localDay();
  const agingBy = params.agingBy === 'invoiceDate' ? 'invoiceDate' : 'dueDate';
  const page = params.page || '1'; const pageSize = params.pageSize || '25';
  const load = useCallback(() => getAgingReport({ kind, asOf, agingBy, page, pageSize }), [kind, asOf, agingBy, page, pageSize]);
  const { data, loading, error, retry } = useWorkspaceData(load);
  const fmt = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data?.currency ?? money.currency }).format(Number(value));
  function exportPage() {
    if (!data) return;
    const rows = [['As of', 'Currency', 'Aging by', 'Party', 'Reference', 'Invoice date', 'Due date', 'Original amount', 'Payments net of corrections', 'Open balance', 'Age bucket'],
      ...data.items.map(row => [data.asOf, data.currency, data.agingBy, row.partyName, row.reference, row.date, row.dueDate, row.originalAmount, row.paidAsOf, row.balance, bucketLabels[row.bucket]])];
    const cell = (value: string) => '"' + (/^[=+@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = kind + '-aging-' + asOf + '-page-' + page + '.csv'; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="workspace-page"><div className="workspace-content space-y-5">
    <WorkspaceHeading section="Reports" title="Receivables and payables aging" description="See what remained open at a date, then prove it agrees with the ledger." actions={<Link href="/reports" className="workspace-button">Financial statements</Link>} />
    <nav className="workspace-tabs" aria-label="Aging reports">{(['receivables', 'payables'] as const).map(value => <button type="button" key={value} className="workspace-tab" aria-current={kind === value ? 'page' : undefined} onClick={() => update({ kind: value, page: '1' })}>{value === 'receivables' ? 'Accounts receivable' : 'Accounts payable'}</button>)}</nav>
    <div className="flex flex-wrap items-end gap-4 border-b border-slate-300 pb-5">
      <label className="grid gap-1.5 text-sm font-semibold">As of date<input className="workspace-field" type="date" value={asOf} onChange={event => { if (event.target.value) update({ asOf: event.target.value, page: '1' }); }} /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Age from<select className="workspace-field" value={agingBy} onChange={event => update({ agingBy: event.target.value, page: '1' })}><option value="dueDate">Due date · days overdue</option><option value="invoiceDate">Invoice date · days outstanding</option></select></label>
      <p className="py-2 text-sm text-slate-600">{data?.currency ?? money.currency} · Accrual basis · Cutoff includes the selected date</p>
    </div>
    {loading && <p role="status">Reconstructing balances at {asOf}…</p>}{error && <WorkspaceNotice title="Aging could not load" onRetry={retry}>Check the selected date and try again.</WorkspaceNotice>}
    {data && <>
      <WorkspacePanel title="Agreement with the general ledger" description="A balanced trial balance alone does not prove that customer and supplier balances agree.">
        <div className="flex flex-wrap justify-between gap-3 border-b border-slate-200 p-4 text-sm"><p className="font-semibold">{data.reconciliation.balanced ? 'Reconciled to the ledger' : 'Review reconciliation exceptions'}</p><p>Difference · <strong className="tabular-nums">{fmt(data.reconciliation.difference)}</strong></p></div>
        <div className="workspace-table-wrap"><table className="workspace-table workbench-table"><thead><tr><th scope="col">Control account</th><th scope="col" className="workspace-number">Ledger</th><th scope="col" className="workspace-number">Documents</th><th scope="col" className="workspace-number">Difference</th></tr></thead><tbody>{data.reconciliation.controls.map(row => <tr key={row.accountId}><td data-label="Control account"><Link className="workspace-text-action" href={'/reports?tab=trial-balance&asOf=' + asOf + '&account=' + row.accountId}>{row.code} · {row.name}</Link></td><td data-label="Ledger" className="workspace-number">{fmt(row.ledgerBalance)}</td><td data-label="Documents" className="workspace-number">{fmt(row.subledgerBalance)}</td><td data-label="Difference" className="workspace-number">{fmt(row.difference)}</td></tr>)}</tbody></table></div>
        {!data.reconciliation.controls.length && <p className="p-4 text-sm">Designate an {kind === 'receivables' ? 'Accounts Receivable' : 'Accounts Payable'} control account in <Link className="workspace-text-action" href="/ledger?tab=accounts">Chart of accounts</Link>.</p>}
        {(data.reconciliation.unverifiedDocuments > 0 || data.reconciliation.unmappedDocuments > 0) && <p className="border-t border-slate-200 p-4 text-sm text-rose-800">{data.reconciliation.unverifiedDocuments} legacy documents have no verified posting; {data.reconciliation.unmappedDocuments} posted documents have no designated control account. Review the source records before relying on the report.</p>}
        {!data.reconciliation.balanced && <p className="border-t border-slate-200 p-4 text-sm text-slate-600">Inspect manual control-account journals, missing opening documents and legacy postings. A difference stays visible until it is explained.</p>}
      </WorkspacePanel>
      <WorkspacePanel title="Aging distribution" description={agingBy === 'dueDate' ? 'Current means not past due. Partial payments and dated corrections are reflected at the cutoff.' : 'Age is measured from the original invoice date, independently of payment terms.'}>
        <dl className="grid grid-cols-2 divide-slate-200 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(bucketLabels).map(([key, label]) => <div className="border-b border-slate-200 p-4" key={key}><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-2 whitespace-nowrap text-base font-semibold tabular-nums">{fmt(key === 'credit' ? data.totals.credits : data.buckets[key])}</dd></div>)}</dl>
        <p className="flex flex-wrap justify-between gap-3 p-4 text-sm"><span>{kind === 'receivables' ? 'Open invoices' : 'Open bills'} {fmt(data.totals.debits)} · Credits {fmt(data.totals.credits)}</span><strong>Net open balance {fmt(data.totals.net)}</strong></p>
      </WorkspacePanel>
      <WorkspacePanel title={kind === 'receivables' ? 'Customer balances' : 'Supplier balances'} description="Balances owed and offsetting credits are shown separately; credits are not hidden inside an aging bucket."><div className="workspace-table-wrap"><table className="workspace-table workbench-table"><thead><tr><th scope="col">{kind === 'receivables' ? 'Customer' : 'Supplier'}</th>{Object.entries(bucketLabels).filter(([key]) => key !== 'credit').map(([key, label]) => <th scope="col" key={key} className="workspace-number">{label}</th>)}<th scope="col" className="workspace-number">Credits</th><th scope="col" className="workspace-number">Net balance</th></tr></thead><tbody>{data.parties.map(row => <tr key={row.partyId}><td data-label="Party">{row.partyName}<span className="block text-xs text-slate-600">{row.documents} open documents</span></td>{Object.entries(bucketLabels).filter(([key]) => key !== 'credit').map(([key, label]) => <td key={key} data-label={label} className="workspace-number">{fmt(row.buckets[key])}</td>)}<td data-label="Credits" className="workspace-number">{fmt(row.credits)}</td><td data-label="Net balance" className="workspace-number">{fmt(row.balance)}</td></tr>)}</tbody></table></div>{!data.parties.length && <p className="p-4 text-sm text-slate-600">No verified open documents at this date.</p>}</WorkspacePanel>
      <WorkspacePanel title="Open document detail" action={<button type="button" className="workspace-button" onClick={exportPage} disabled={!data.items.length}>Export this page CSV</button>}>
        <div className="workspace-table-wrap"><table className="workspace-table workbench-table"><thead><tr><th scope="col">Document</th><th scope="col">Party</th><th scope="col">Invoice date</th><th scope="col">Due date</th><th scope="col">Age</th><th scope="col" className="workspace-number">Open balance</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td data-label="Document"><Link className="workspace-text-action" href={(kind === 'receivables' ? '/sales/invoices/' : '/purchases/bills/') + row.id}>{row.reference}</Link>{row.isOpeningBalance && <span className="block text-xs text-slate-600">Opening balance</span>}</td><td data-label="Party">{row.partyName}</td><td data-label="Invoice date">{row.date}</td><td data-label="Due date">{row.dueDate}</td><td data-label="Age">{bucketLabels[row.bucket]}</td><td data-label="Open balance" className="workspace-number">{fmt(row.balance)}</td></tr>)}</tbody></table></div>
        <WorklistPagination data={data} loading={loading} onPage={value => update({ page: String(value) })} onPageSize={value => update({ pageSize: value, page: '1' })} />
      </WorkspacePanel>
    </>}
  </div></div>;
}
export default function AgingPage() { return <Suspense fallback={<p role="status" className="p-6">Opening aging reports…</p>}><AgingContent /></Suspense>; }
