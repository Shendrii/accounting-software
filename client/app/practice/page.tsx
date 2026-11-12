'use client';

import { useCallback, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { workflowRequest } from '@/lib/practice-api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { useWorkspaces } from '@/app/components/WorkspaceProvider';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

interface Task { workspaceId: string; workspaceName: string; role: string; currency: string; type: string; title: string; href: string; count: number; due: string | null; overdue: boolean }
interface Queue { items: Task[]; total: number; totalPages: number; clients: number; overdue: number; asOf: string }
const types = [['documents', 'Receipt review'], ['sales', 'Invoice drafts'], ['purchases', 'Bills & payments'], ['journals', 'Journal drafts'], ['banking', 'Bank matching & review'], ['recurring', 'Recurring drafts'], ['reminders', 'Invoice reminders'], ['close', 'Period close'], ['follow-up', 'Collections & promises'], ['setup', 'Workspace setup']];

export default function Page() {
  const { workspaces, selectWorkspace } = useWorkspaces();
  const [client, setClient] = useState(''), [type, setType] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const list = useWorkspaceData(useCallback(() => workflowRequest<Queue>('/practice?' + new URLSearchParams({ workspaceId: client, type, q: search, page: String(page) })), [client, type, search, page]));
  function open(task: Task) {
    const workspace = workspaces.find(item => item.id === task.workspaceId);
    if (workspace) selectWorkspace(workspace, task.href);
  }
  return <div className="workspace-page"><div className="workspace-content space-y-5">
    <WorkspaceHeading section="Practice" title="Practice work queue" description="See the next bookkeeping work across your accessible client workspaces." actions={<button className="workspace-button" onClick={list.retry} disabled={list.loading}><RefreshCw className="size-4" aria-hidden="true" />Refresh work</button>} />
    <p className="max-w-3xl text-sm leading-relaxed text-slate-600">All accessible workspaces · Work is grouped by client and task. Opening an item selects that client before showing its records. Currency and access stay visible; financial balances are kept in each workspace.</p>
    <div className="grid gap-4 border-y border-slate-300 py-4 sm:grid-cols-2 xl:grid-cols-3">
      <label className="grid gap-1.5 text-sm font-semibold">Find client or work<input className="workspace-field" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Client name or task" /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Client workspace<select className="workspace-field" value={client} onChange={event => { setClient(event.target.value); setPage(1); }}><option value="">All accessible workspaces</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-semibold">Work type<select className="workspace-field" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">All work types</option>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {list.error && <WorkspaceNotice title="Practice work could not load" onRetry={list.retry}>{list.errorMessage}</WorkspaceNotice>}
    <WorkspacePanel title="Next work by client" description={list.data ? list.data.total + ' work groups across ' + list.data.clients + ' clients · ' + list.data.overdue + ' past their reference date · Updated ' + list.data.asOf + ' UTC' : 'Checking your current workspace memberships…'}>
      <div className="workspace-table-wrap" aria-busy={list.loading}><table className="workspace-table workbench-table"><thead><tr><th>Client workspace</th><th>Work</th><th>Reference date</th><th className="workspace-number">Items</th><th>Action</th></tr></thead><tbody>{list.data?.items.map(task => <tr key={task.workspaceId + task.type + task.title}><td data-label="Client workspace"><strong className="font-semibold">{task.workspaceName}</strong><p className="text-xs text-slate-600">{task.currency} · {task.role === 'VIEWER' ? 'Read-only' : task.role === 'MEMBER' ? 'Bookkeeper' : task.role === 'APPROVER' ? 'Reviewer' : task.role.toLowerCase()}</p></td><td data-label="Work">{task.title}</td><td data-label="Reference date">{task.due || 'Awaiting review'}{task.overdue && <p className="text-xs font-semibold text-amber-900">Past reference date</p>}</td><td data-label="Items" className="workspace-number">{task.count}</td><td data-label="Action"><button className="workspace-text-action" onClick={() => open(task)}>Open client work<ArrowUpRight className="ml-1 size-4" aria-hidden="true" /></button></td></tr>)}</tbody></table></div>
      {!list.data?.items.length && <p role="status" className="p-5 text-sm text-slate-600">{list.loading ? list.slow ? 'The backend is still responding. Your client selection is preserved.' : 'Loading work across accessible clients…' : list.error ? 'Work is unavailable. Retry the connection above.' : 'No work matches this view. Clear the filters or refresh after new records are added. A clear queue does not certify that the books are reconciled.'}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><button className="workspace-button" disabled={page <= 1 || list.loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {list.data?.totalPages || 1}</span><button className="workspace-button" disabled={list.loading || page >= (list.data?.totalPages || 1)} onClick={() => setPage(page + 1)}>Next</button></div>
    </WorkspacePanel>
    <p className="max-w-3xl text-xs leading-relaxed text-slate-600">Dates identify scheduled drafts, close targets, overdue promises and invoice due dates. Receipt dates identify when evidence entered the queue. Unscheduled drafts and bank matches remain awaiting review. Your role determines which actions are available inside each client workspace.</p>
  </div></div>;
}
