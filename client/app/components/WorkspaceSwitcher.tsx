'use client';

import Link from 'next/link';
import { Building2, Check, ChevronsUpDown, Plus, Search, Settings2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { AuthWorkspace } from '@/lib/api';
import { useWorkspaces } from './WorkspaceProvider';

export function WorkspaceAvatar({ name, type }: { name: string; type?: AuthWorkspace['type'] }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
  return (
    <span aria-hidden="true" className={'grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold ' +
      (type === 'TEAM' ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-900')}>
      {initials || <Building2 className="size-4" />}
    </span>
  );
}

export function WorkspaceRole({ role }: { role: AuthWorkspace['role'] }) {
  return <span className="capitalize">{{ OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Bookkeeper', APPROVER: 'Reviewer', VIEWER: 'Read only' }[role]}</span>;
}

export function WorkspaceActiveBadge() {
  return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
    <Check className="size-3" aria-hidden="true" />Active
  </span>;
}

export default function WorkspaceSwitcher({ mobile = false }: { mobile?: boolean }) {
  const { workspaces, active, loading, error, retry, selectWorkspace, openCreate } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const pickerId = useId();
  const titleId = useId();
  const needle = search.trim().toLowerCase();
  const matches = workspaces.filter(workspace => workspace.name.toLowerCase().includes(needle));
  const name = active?.name ?? (loading ? 'Loading workspaces…' : 'Choose workspace');

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = Array.from(container.current?.querySelectorAll<HTMLButtonElement>('[data-workspace-option]') ?? []);
    if (!options.length || (event.target !== searchInput.current && !options.includes(event.target as HTMLButtonElement))) return;
    const index = options.indexOf(event.target as HTMLButtonElement);
    const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    event.preventDefault();
    options[next].focus();
  }

  return (
    <div ref={container} className={mobile ? 'relative min-w-0 max-sm:order-last max-sm:w-full sm:max-w-[58%] lg:hidden' : 'relative shrink-0 px-3 max-lg:hidden'}
      onKeyDown={onKeyDown} onBlur={event => {
        if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(false);
      }}>
      <button ref={trigger} type="button" aria-label={'Switch workspace, current: ' + name} aria-expanded={open} aria-controls={open ? pickerId : undefined}
        title={name} onClick={() => { if (open) close(); else { setSearch(''); setOpen(true); } }}
        className={'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border text-left transition-colors ' +
          (mobile ? 'border-slate-200 bg-white p-1.5 text-slate-900 hover:bg-blue-50'
            : 'border-slate-300 bg-white p-2.5 text-slate-950 hover:border-blue-700 hover:bg-blue-50')}>
        <WorkspaceAvatar name={active?.name ?? ''} type={active?.type} />
        <span className="min-w-0 flex-1">
          <span className={'block text-[10px] font-semibold tracking-wider uppercase ' + (mobile ? 'text-slate-600' : 'text-slate-600')}>Active workspace</span>
          <span className="block text-xs font-semibold break-words sm:truncate">{name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
      </button>

      {open && <section id={pickerId} aria-labelledby={titleId}
        className={'absolute z-[60] w-88 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-xl ' +
          (mobile ? 'right-0 top-full mt-2' : 'left-[calc(100%-0.75rem)] top-0')}>
        <header className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div><h2 id={titleId} className="mt-1 font-semibold tracking-tight">Your workspaces</h2></div>
          <button type="button" aria-label="Close workspace switcher" className="workspace-button min-w-10 px-2" onClick={() => close()}><X className="size-4" aria-hidden="true" /></button>
        </header>
        <div className="px-4">
          <label className="relative block">
            <span className="sr-only">Find a workspace</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input type="search" autoComplete="off" ref={searchInput} value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Find a workspace…" className="workspace-field bg-slate-50 pl-9" />
          </label>
        </div>
        <div className="max-h-[min(17rem,40dvh)] overflow-y-auto px-2 py-2">
          {loading && <p role="status" className="px-2 py-2 text-sm text-slate-600">Loading workspaces…</p>}
          {error && <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 text-sm" role="alert">
            <p>Workspaces could not load.</p><button type="button" className="workspace-button" onClick={retry}>Retry</button>
          </div>}
          {!loading && !error && !matches.length && <p role="status" className="px-2 py-2 text-sm text-slate-600">
            {needle ? 'No workspaces match your search.' : 'No workspaces yet.'}
          </p>}
          {(['PERSONAL', 'TEAM'] as const).map(type => {
            const group = matches.filter(workspace => workspace.type === type);
            if (!group.length) return null;
            return <div key={type} className="space-y-0.5">
              <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">{type === 'PERSONAL' ? 'Personal' : 'Team workspaces'}</p>
              {group.map(workspace => <button key={workspace.id} type="button" data-workspace-option
                aria-pressed={workspace.id === active?.id} onClick={() => { close(); selectWorkspace(workspace); }}
                className={'flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left ' +
                  (workspace.id === active?.id ? 'border-blue-100 bg-blue-50' : 'border-transparent hover:bg-slate-50')}>
                <WorkspaceAvatar name={workspace.name} type={workspace.type} />
                <span className="min-w-0 flex-1"><span className="block text-sm leading-tight font-semibold break-words">{workspace.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{type === 'PERSONAL' ? 'Personal' : 'Team'} · <WorkspaceRole role={workspace.role} /></span>
                </span>
                {workspace.id === active?.id && <WorkspaceActiveBadge />}
              </button>)}
            </div>;
          })}
        </div>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-3 py-2.5">
          <button type="button" className="workspace-primary" onClick={() => { close(); openCreate(); }}><Plus className="size-4" aria-hidden="true" />New workspace</button>
          <Link href="/settings#workspaces" className="workspace-button" onClick={() => close(false)}><Settings2 className="size-4" aria-hidden="true" />Manage</Link>
        </footer>
      </section>}
    </div>
  );
}
