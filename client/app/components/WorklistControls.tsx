'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PageResult } from '@/lib/api';
export function useWorklist() {
  const pathname = usePathname(); const router = useRouter(); const search = useSearchParams();
  const query = search.toString();
  function update(values: Record<string, string>, reset = true) {
    const next = new URLSearchParams(query);
    if (reset) { next.delete('page'); next.delete('preview'); }
    for (const [key, value] of Object.entries(values)) if (value) next.set(key, value); else next.delete(key);
    router.replace(pathname + (next.size ? '?' + next : ''), { scroll: false });
  }
  const params = Object.fromEntries(search.entries());
  return { pathname, query, params, update, returnTo: pathname + (query ? '?' + query : '') };
}
function SearchField({ value, onSearch }: { value: string; onSearch: (value: string) => void }) {
  const [draft, setDraft] = useState(value); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <label className="grid min-w-48 flex-1 gap-1 text-xs font-semibold">Search
    <input type="search" className="workspace-field" value={draft} maxLength={160} placeholder="Number, contact, or supplier reference…" onChange={event => {
      const next = event.target.value; setDraft(next); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => onSearch(next.trim()), 400);
    }} /></label>;
}
const viewKeys = ['q', 'status', 'view', 'startDate', 'endDate', 'sort', 'direction', 'pageSize', 'density'];
function SavedViews({ query, onApply, kind }: { query: string; onApply: (values: Record<string, string>) => void; kind: string }) {
  const [views, setViews] = useState<{ name: string; query: Record<string, string> }[]>([]);
  const [name, setName] = useState(''); const [message, setMessage] = useState('');
  function storageKey() {
    let user = ''; try { user = JSON.parse(localStorage.getItem('auth_user') || '{}').id || ''; } catch { /* invalid session has no shared saved views */ }
    return 'accountrix:views:' + user + ':' + localStorage.getItem('workspace_id') + ':' + kind;
  }
  function load() { try { const data = JSON.parse(localStorage.getItem(storageKey()) || '[]'); setViews(Array.isArray(data) ? data.filter(item => typeof item.name === 'string' && item.query && typeof item.query === 'object').slice(0, 5) : []); } catch { setViews([]); } }
  function persist(next: typeof views) { try { localStorage.setItem(storageKey(), JSON.stringify(next)); setViews(next); setMessage('Saved on this browser for this workspace.'); } catch { setMessage('Browser storage is unavailable.'); } }
  return <details className="workbench-saved" onToggle={event => { if (event.currentTarget.open) load(); }}><summary className="cursor-pointer text-sm font-semibold">Saved views</summary>
    <div className="mt-3 flex flex-wrap items-end gap-2">{views.map(view => <div key={view.name} className="flex gap-1"><button type="button" className="workspace-button" onClick={() => onApply(Object.fromEntries(viewKeys.map(key => [key, typeof view.query[key] === 'string' ? view.query[key] : ''])))}>{view.name}</button><button type="button" className="workspace-button" aria-label={'Delete saved view ' + view.name} onClick={() => persist(views.filter(item => item.name !== view.name))}><X className="size-4" aria-hidden="true" /></button></div>)}
      <label className="grid gap-1 text-xs font-semibold">View name<input className="workspace-field" maxLength={32} value={name} onChange={event => setName(event.target.value)} placeholder="My open invoices" /></label>
      <button type="button" className="workspace-button" disabled={!name.trim() || views.length >= 5 && !views.some(view => view.name === name.trim())} onClick={() => {
        const params = new URLSearchParams(query); const next = { name: name.trim(), query: Object.fromEntries(viewKeys.flatMap(key => params.has(key) ? [[key, params.get(key)!]] : [])) };
        persist([...views.filter(view => view.name !== next.name), next]); setName('');
      }}>Save current view</button><p className="w-full text-xs text-slate-600" role="status">{message || 'Up to five views, stored on this browser for this workspace.'}</p>
    </div>
  </details>;
}
export function WorklistControls({ state, kind, statuses, views = [] }: {
  state: ReturnType<typeof useWorklist>; kind: string; statuses: [string, string][]; views?: [string, string][];
}) {
  const { params, update } = state;
  return <div className="workbench-controls space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <SearchField key={params.q || ''} value={params.q || ''} onSearch={q => update({ q })} />
      <label className="grid gap-1 text-xs font-semibold">Status<select className="workspace-field" value={params.status || ''} onChange={event => update({ status: event.target.value })}><option value="">All statuses</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {views.length > 0 && <label className="grid gap-1 text-xs font-semibold">View<select className="workspace-field" value={params.view || 'all'} onChange={event => update({ view: event.target.value, status: '' })}><option value="all">All records</option>{views.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <label className="grid gap-1 text-xs font-semibold">{kind === 'documents' ? 'Uploaded from' : 'From'}<input type="date" className="workspace-field" value={params.startDate || ''} onChange={event => update({ startDate: event.target.value })} /></label>
      <label className="grid gap-1 text-xs font-semibold">{kind === 'documents' ? 'Uploaded through' : 'Through'}<input type="date" className="workspace-field" value={params.endDate || ''} onChange={event => update({ endDate: event.target.value })} /></label>
      <label className="grid gap-1 text-xs font-semibold">Density<select className="workspace-field" value={params.density || 'comfortable'} onChange={event => update({ density: event.target.value }, false)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      <label className={'grid gap-1 text-xs font-semibold ' + (kind === 'documents' ? '' : 'sm:hidden')}>Sort by<select className="workspace-field" value={params.sort || 'date'} onChange={event => update({ sort: event.target.value })}>{(kind === 'documents' ? [['date', 'Upload date'], ['vendor', 'Vendor'], ['total', 'Total']] : [['date', 'Date'], ['dueDate', 'Due date'], ['reference', 'Number'], ['counterparty', 'Contact'], ['total', 'Total'], ['balance', 'Balance due']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" className={'workspace-button ' + (kind === 'documents' ? '' : 'sm:hidden')} onClick={() => update({ direction: (params.direction || 'desc') === 'desc' ? 'asc' : 'desc' })}>{(params.direction || 'desc') === 'desc' ? 'Descending ↓' : 'Ascending ↑'}</button>
      <button type="button" className="workspace-button" onClick={() => update(Object.fromEntries(viewKeys.map(key => [key, ''])))}>Reset filters</button>
    </div><SavedViews kind={kind} query={state.query} onApply={values => update(values)} />
  </div>;
}
export function WorklistPagination({ data, loading, onPage, onPageSize }: { data: PageResult<unknown> | null; loading: boolean; onPage: (page: number) => void; onPageSize?: (size: string) => void }) {
  return <div className="workbench-pagination"><p role="status">{loading ? 'Loading records…' : data ? data.total + ' records · Page ' + data.page + ' of ' + data.totalPages : 'Records unavailable'}</p><div className="flex flex-wrap items-center gap-2">
    {onPageSize && <label className="flex items-center gap-2">Rows<select className="workspace-field w-auto" value={data?.pageSize || 25} onChange={event => onPageSize(event.target.value)}>{[25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>}
    {data && data.page > data.totalPages && <button type="button" className="workspace-button" onClick={() => onPage(1)}>First page</button>}
    <button type="button" className="workspace-button" disabled={loading || !data || data.page <= 1} onClick={() => onPage(data!.page - 1)}>Previous</button><button type="button" className="workspace-button" disabled={loading || !data || data.page >= data.totalPages} onClick={() => onPage(data!.page + 1)}>Next</button>
  </div></div>;
}
