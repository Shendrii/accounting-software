'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { getInvoice, getInvoicePage, type Invoice } from '@/lib/api';
import { workflowRequest } from '@/lib/practice-api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { useMoney } from '@/lib/use-money';
import { useWorkspaces } from '@/app/components/WorkspaceProvider';
import { workspacePermissions } from '@/lib/workspace-permissions';
import { WorkflowTabs, WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';
import { InvoiceScheduleForm } from '@/app/components/InvoiceAutomation';
import AccountingDialog from '@/app/components/AccountingDialog';

type Template = Invoice & { nextOccurrences: string[] };
function Content() {
  const { active } = useWorkspaces(), access = workspacePermissions(active), money = useMoney();
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [sourceSearch, setSourceSearch] = useState(''), [sourceId, setSourceId] = useState(''), [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const list = useWorkspaceData(useCallback(() => workflowRequest<{ items: Template[]; total: number; totalPages: number }>('/recurring/invoices?' + new URLSearchParams({ page: String(page), q: search })), [page, search]));
  const sources = useWorkspaceData(useCallback(() => choosing ? getInvoicePage({ q: sourceSearch, pageSize: '25', view: 'all' }) : Promise.resolve(null), [choosing, sourceSearch]));
  const source = useWorkspaceData(useCallback(() => sourceId ? getInvoice(sourceId) : Promise.resolve(null), [sourceId]));
  async function run() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await workflowRequest<{ created: number; remainingTemplates: number }>('/recurring/run', { requestId: requestId.current, kind: 'invoice' });
      setMessage(result.created + ' invoice drafts created for review. ' + (result.remainingTemplates ? result.remainingTemplates + ' templates remain due; run again to generate their next occurrence.' : 'No templates remain due.'));
      requestId.current = crypto.randomUUID(); list.retry();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Draft generation could not finish. Retry this run.'); }
    finally { setBusy(false); }
  }
  return <div className="workspace-page"><div className="workspace-content space-y-5">
    <WorkspaceHeading section="Sales" title="Recurring invoices" description="Generate reviewable drafts from an existing invoice. Posting and emailing stay separate." actions={access.prepare && <><button className="workspace-button" onClick={() => { setChoosing(true); setSourceId(''); }}>Add invoice schedule</button><button className="workspace-primary" disabled={busy} onClick={() => void run()}>{busy ? 'Generating invoice drafts…' : 'Generate due drafts'}</button></>} />
    <WorkflowTabs area="sales" active="recurring" />
    <p className="text-sm text-slate-600">A run creates up to 20 due occurrences in the current workspace. Missed periods are generated in order; drafts keep the original payment interval. Review all dates, tax codes and amounts before posting.</p>
    <label className="grid max-w-lg gap-1.5 text-sm font-semibold">Find a template<input className="workspace-field" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Invoice number or customer" type="search" /></label>
    {message && <p role="status" className="text-sm text-emerald-800">{message} <Link href="/sales/invoices?status=DRAFT" className="workspace-text-action">Review invoice drafts</Link></p>}{error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    {list.error && <WorkspaceNotice title="Recurring invoices could not load" onRetry={list.retry}>{list.errorMessage}</WorkspaceNotice>}
    <WorkspacePanel title="Invoice templates" description="Each occurrence has a unique identity so concurrent runs and retries cannot create it twice."><div className="workspace-table-wrap" aria-busy={list.loading}><table className="workspace-table workbench-table"><thead><tr><th>Template / customer</th><th>Interval</th><th>Next draft dates</th><th className="workspace-number">Template amount</th><th>Action</th></tr></thead><tbody>{list.data?.items.map(invoice => <tr key={invoice.id}><td data-label="Template / customer"><Link href={'/sales/invoices/' + invoice.id} className="workspace-text-action">{invoice.invoiceNo}</Link><p className="text-xs text-slate-600">{invoice.customer?.name}</p></td><td data-label="Interval">{invoice.recurrenceInterval}</td><td data-label="Next draft dates">{invoice.nextOccurrences.join(' / ')}</td><td data-label="Template amount" className="workspace-number">{money.format(invoice.total)}</td><td data-label="Action">{access.prepare && <button className="workspace-text-action" onClick={() => { setSourceId(invoice.id); setChoosing(true); }}>Edit schedule</button>}</td></tr>)}</tbody></table></div>{!list.data?.items.length && <p role="status" className="p-5 text-sm text-slate-600">{list.loading ? 'Loading invoice schedules…' : 'No templates match. Add a schedule from an existing sales invoice.'}</p>}<div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><button className="workspace-button" disabled={page <= 1 || list.loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {list.data?.totalPages || 1} · {list.data?.total || 0} templates</span><button className="workspace-button" disabled={list.loading || page >= (list.data?.totalPages || 1)} onClick={() => setPage(page + 1)}>Next</button></div></WorkspacePanel>
    {choosing && <AccountingDialog title="Recurring invoice schedule" onDismiss={() => setChoosing(false)}><div className="space-y-4">{!sourceId && <><p className="text-sm">Choose the invoice whose customer, lines and payment terms should repeat.</p><label className="grid gap-1.5 text-sm font-semibold">Find a source invoice<input className="workspace-field" value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Invoice number or customer" /></label><label className="grid gap-1.5 text-sm font-semibold">Source invoice<select className="workspace-field" value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Select an invoice</option>{sources.data?.items.filter(invoice => !invoice.isOpeningBalance && invoice.status !== 'VOID').map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} · {invoice.customer?.name}</option>)}</select></label><p className="text-xs text-slate-600">Showing the first 25 matches. Refine the search to find an older invoice.</p></>}{(sources.error || source.error) && <WorkspaceNotice title="Source invoices could not load" onRetry={() => { sources.retry(); source.retry(); }} />}{sourceId && source.loading && <p role="status" className="text-sm">Loading invoice template…</p>}{source.data && <InvoiceScheduleForm key={source.data.id} invoice={source.data} onSaved={list.retry} />}</div></AccountingDialog>}
  </div></div>;
}
export default function Page() { const { active } = useWorkspaces(); return <Suspense fallback={<p role="status" className="p-6">Opening invoice schedules…</p>}><Content key={active?.id} /></Suspense>; }
