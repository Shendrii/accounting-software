'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getPendingReceiptCount } from '@/lib/api';
import { clearSession, getCurrentUser, useActiveWorkspaceId, useIsAuthenticated } from '@/lib/auth';
import { navigationClusters, workspaceSection } from '@/lib/navigation';
import { hideAppChrome } from '@/lib/public-paths';
import { WorkspaceBrand, WorkspaceNavigation } from './WorkspaceSidebar';
import { useWorkspaces } from './WorkspaceProvider';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function SideNav() {
  const pathname = usePathname();
  const signedIn = useIsAuthenticated();
  const workspaceId = useActiveWorkspaceId();
  const visible = !hideAppChrome(pathname, signedIn);
  const { active: selected } = useWorkspaces();
  const [inboxCount, setInboxCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!visible || !signedIn) return;
    let current = true;
    getPendingReceiptCount().then(count => {
      if (current) setInboxCount(count);
    }).catch(() => {});
    return () => { current = false; };
  }, [pathname, visible, signedIn, workspaceId]);

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
        <WorkspaceSwitcher mobile />
      </header>

      {menuOpen && <div onClick={closeMenu} className="fixed inset-0 z-40 bg-slate-950/55 lg:hidden" aria-hidden="true" />}
      <aside id="workspace-sidebar" className={`workspace-sidebar motion-safe:transition-transform lg:visible lg:translate-x-0 ${menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-5 pb-4">
          <WorkspaceBrand onClick={() => setMenuOpen(false)} />
          <button ref={closeButton} type="button" className="grid size-11 place-items-center rounded-lg text-blue-100 hover:bg-blue-400/15 lg:hidden" aria-label="Close workspace navigation" onClick={closeMenu}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <WorkspaceSwitcher />
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
