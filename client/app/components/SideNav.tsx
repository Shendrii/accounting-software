'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchWorkspaces, getReceipts, type AuthWorkspace } from '@/lib/api';
import { clearSession, getCurrentUser, getWorkspaceId, isAuthenticated, setWorkspaceId, useActiveWorkspaceId, useIsAuthenticated } from '@/lib/auth';
import { navigationClusters, workspaceSection } from '@/lib/navigation';
import { hideAppChrome } from '@/lib/public-paths';
import { WorkspaceBrand, WorkspaceNavigation } from './WorkspaceSidebar';

export default function SideNav() {
  const pathname = usePathname();
  const signedIn = useIsAuthenticated();
  const workspaceId = useActiveWorkspaceId();
  const visible = !hideAppChrome(pathname, signedIn);
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!visible || !isAuthenticated()) return;
    let current = true;
    fetchWorkspaces().then(rows => {
      if (!current) return;
      if (!getWorkspaceId() && rows[0]) setWorkspaceId(rows[0].id);
      setWorkspaces(rows);
    }).catch(() => {});
    getReceipts('PENDING').then(rows => {
      if (current) setInboxCount(rows.length);
    }).catch(() => {});
    return () => { current = false; };
  }, [pathname, visible, workspaceId]);

  useEffect(() => {
    if (!menuOpen) return;
    closeButton.current?.focus();
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [menuOpen]);

  if (!visible) return null;

  const selected = workspaces.find(workspace => workspace.id === workspaceId);
  const name = getCurrentUser()?.name ?? 'Signed in';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const section = navigationClusters.flatMap(group => group.items).find(item => item.href === workspaceSection(pathname));
  const closeMenu = () => {
    setMenuOpen(false);
    menuButton.current?.focus();
  };

  return (
    <>
      <header className="workspace-topbar">
        <div className="flex min-w-0 items-center gap-2.5 text-sm">
          <button ref={menuButton} type="button" className="workspace-button min-h-11 min-w-11 px-2 lg:hidden" aria-label="Open workspace navigation"
            aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(true)}>
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Link href="/" className="hidden rounded text-slate-600 hover:text-blue-800 sm:inline">Workspace</Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-slate-400 sm:inline" aria-hidden="true" />
          <span className="truncate font-semibold text-slate-950">{section?.name ?? 'Overview'}</span>
        </div>
        {selected && <span className="max-w-[45%] truncate rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-900" title={selected.name}>{selected.name}</span>}
      </header>

      {menuOpen && <div onClick={closeMenu} className="fixed inset-0 z-40 bg-slate-950/55 lg:hidden" aria-hidden="true" />}
      <aside id="workspace-sidebar" className={`workspace-sidebar motion-safe:transition-transform lg:visible lg:translate-x-0 ${menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-5 pb-4">
          <WorkspaceBrand onClick={() => setMenuOpen(false)} />
          <button ref={closeButton} type="button" className="grid size-11 place-items-center rounded-lg text-blue-100 hover:bg-blue-400/15 lg:hidden" aria-label="Close workspace navigation" onClick={closeMenu}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="shrink-0 px-3">
          <label className="relative block rounded-xl border border-blue-100/20 bg-white/5">
            <span className="block px-3 pt-2 text-[11px] font-semibold tracking-[0.12em] text-blue-100/80 uppercase">Active workspace</span>
            <select aria-label="Active workspace" value={selected?.id ?? ''} onChange={event => {
              if (!event.target.value) return;
              setWorkspaceId(event.target.value);
              window.location.reload();
            }} className="w-full cursor-pointer appearance-none truncate rounded-b-xl bg-transparent px-3 pt-1 pb-2.5 pr-8 text-sm font-medium text-white">
              {!selected && <option value="" disabled className="text-slate-900">Select workspace</option>}
              {workspaces.map(workspace => <option key={workspace.id} value={workspace.id} className="text-slate-900">{workspace.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 bottom-3 size-4 text-blue-100/80" aria-hidden="true" />
          </label>
        </div>
        <WorkspaceNavigation pathname={pathname} inboxCount={inboxCount} onNavigate={() => setMenuOpen(false)} />

        <div className="flex shrink-0 items-center gap-2.5 border-t border-blue-100/15 px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-400/20 text-xs font-semibold text-blue-50" aria-hidden="true">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={name}>{name}</p>
            <p className="truncate text-xs text-blue-100/80 capitalize">{selected ? selected.role.toLowerCase() : 'Workspace'}</p>
          </div>
          <button type="button" onClick={() => { clearSession(); window.location.href = '/login'; }}
            aria-label="Log out" className="grid size-10 shrink-0 place-items-center rounded-lg text-blue-100 hover:bg-blue-400/15 hover:text-white">
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  );
}
