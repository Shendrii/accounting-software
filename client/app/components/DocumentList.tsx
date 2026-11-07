'use client';
import { useMoney } from '@/lib/use-money';
import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { getInvoicePage, getBillPage, triggerRecurring, type Invoice, type Bill, type PageResult } from '@/lib/api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { localDay } from '@/lib/money';
import { WorkflowTabs, WorkspaceHeading, WorkspaceNotice } from './WorkspaceUI';
import { billStatus, invoiceStatus, WorkspaceStatus } from './WorkspaceActivity';
import { useWorklist, WorklistControls, WorklistPagination } from './WorklistControls';
import RecordPreview from './RecordPreview';
function Content({ kind }: { kind: 'invoice' | 'bill' }) {
  const money = useMoney();
  const state = useWorklist(); const { params, update } = state; const invoice = kind === 'invoice';
  const [recurringBusy, setRecurringBusy] = useState(false); const [message, setMessage] = useState('');
  const filters = JSON.stringify(Object.fromEntries(['page', 'pageSize', 'q', 'status', 'view', 'startDate', 'endDate', 'sort', 'direction'].flatMap(key => params[key] ? [[key, params[key]]] : [])));
  const load = useCallback<() => Promise<PageResult<Invoice | Bill>>>(() => (invoice ? getInvoicePage : getBillPage)({ ...JSON.parse(filters), today: localDay() }), [invoice, filters]);
  const list = useWorkspaceData(load); const data = list.data; const items = data?.items ?? [];
  const selectedIndex = items.findIndex(item => item.id === params.preview);
  const base = invoice ? '/sales/invoices' : '/purchases/bills';
  function sort(key: string) { update({ sort: key, direction: params.sort === key && (params.direction || 'desc') === 'asc' ? 'desc' : 'asc' }); }
  return <div className="workspace-page"><div className="workspace-content space-y-5">
    <WorkspaceHeading section={invoice ? 'Sales' : 'Purchases'} title={invoice ? 'Invoices' : 'Bills'} description={invoice ? 'From draft to collection. Open a preview without losing your place.' : 'Review supplier bills, outstanding balances, and recurring templates.'} actions={<Link className="workspace-primary" href={base + '/new'}>New {kind}</Link>} />
    <WorkflowTabs area={invoice ? 'sales' : 'purchases'} active={invoice ? 'invoices' : 'bills'} />
    <WorklistControls state={state} kind={kind} statuses={invoice ? [['DRAFT', 'Draft'], ['SENT', 'Posted / sent'], ['PAID', 'Paid'], ['VOID', 'Void']] : [['DRAFT', 'Draft'], ['RECEIVED', 'Awaiting payment'], ['PAID', 'Paid'], ['VOID', 'Void']]}
      views={invoice ? [['open', 'Open invoices'], ['overdue', 'Overdue']] : [['open', 'Unpaid bills'], ['overdue', 'Overdue'], ['due-soon', 'Due in 7 days'], ['recurring', 'Recurring templates']]} />
    {list.error && <WorkspaceNotice title="Records could not load" onRetry={list.retry}>Check your filters and try again.</WorkspaceNotice>}
    {params.view === 'recurring' && !invoice && <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-3"><p className="text-sm">Due recurring templates create draft bills for review.</p><button type="button" className="workspace-button" disabled={recurringBusy} onClick={async () => { setRecurringBusy(true); setMessage(''); try { const result = await triggerRecurring(); setMessage(result.created + ' draft bills created.'); list.retry(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not run recurring bills.'); } finally { setRecurringBusy(false); } }}>{recurringBusy ? 'Creating drafts…' : 'Run due templates'}</button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="workspace-panel" aria-busy={list.loading}>
      <div className="workspace-table-wrap"><table className={'workspace-table workbench-table ' + (params.density === 'compact' ? 'workbench-compact' : '')}>
        <caption className="sr-only">{invoice ? 'Invoices' : 'Bills'}, {money.currency}, filtered and sorted before pagination</caption>
        <thead><tr>{[['reference', invoice ? 'Invoice' : 'Bill'], ['counterparty', invoice ? 'Customer' : 'Vendor'], ['date', 'Date'], ['dueDate', 'Due date'], ['total', 'Total'], ['balance', 'Balance due'], ['', 'Status']].map(([key, label]) => <th key={label} scope="col" aria-sort={key && (params.sort || 'date') === key ? (params.direction || 'desc') === 'asc' ? 'ascending' : 'descending' : undefined}>{key ? <button type="button" onClick={() => sort(key)}>{label}{(params.sort || 'date') === key ? (params.direction || 'desc') === 'asc' ? ' ↑' : ' ↓' : ''}</button> : label}</th>)}</tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td data-label={invoice ? 'Invoice' : 'Bill'}><button type="button" className="workspace-text-action min-h-11 text-left" onClick={() => update({ preview: item.id }, false)}>{'invoiceNo' in item ? item.invoiceNo : item.billNo}</button>{'isRecurring' in item && item.isRecurring && <p className="text-xs">Recurring · {item.recurrenceInterval}{item.nextDueDate ? ' · Next ' + item.nextDueDate.slice(0, 10) : ''}</p>}</td>
          <td data-label={invoice ? 'Customer' : 'Vendor'}>{'invoiceNo' in item ? item.customer?.name : item.vendor?.name}</td>
          <td data-label="Date">{item.date.slice(0, 10)}</td><td data-label="Due date">{item.dueDate.slice(0, 10)}</td><td data-label="Total" className="workspace-number">{money.format(item.total)}</td>
          <td data-label="Balance due" className="workspace-number">{item.status === 'DRAFT' || item.status === 'VOID' ? '—' : money.format(item.balanceDue ?? '0')}</td><td data-label="Status"><WorkspaceStatus>{invoice ? invoiceStatus(item as Invoice) : billStatus(item as Bill)}</WorkspaceStatus></td>
        </tr>)}</tbody>
      </table></div>
      {!items.length && <p className="p-6 text-sm text-slate-600" role="status">{list.loading ? 'Loading records…' : list.error ? 'Records are unavailable. Retry above.' : 'No records match this view.'}</p>}
      <WorklistPagination data={data} loading={list.loading} onPage={page => update({ page: String(page), preview: '' }, false)} onPageSize={pageSize => update({ pageSize })} />
    </div>
    {params.preview && <RecordPreview key={params.preview} kind={kind} id={params.preview} returnTo={state.returnTo} onClose={() => update({ preview: '' }, false)} previous={selectedIndex > 0 ? () => update({ preview: items[selectedIndex - 1].id }, false) : undefined} next={selectedIndex >= 0 && selectedIndex < items.length - 1 ? () => update({ preview: items[selectedIndex + 1].id }, false) : undefined} />}
  </div></div>;
}
export default function DocumentList({ kind }: { kind: 'invoice' | 'bill' }) { return <Suspense fallback={<p role="status" className="p-6">Loading worklist…</p>}><Content kind={kind} /></Suspense>; }
