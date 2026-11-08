'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LogOut, Menu, MessageSquare, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getPendingReceiptCount } from '@/lib/api';
import { getCurrentUser, useActiveWorkspaceId, useIsAuthenticated } from '@/lib/auth';
import { logout } from '@/lib/account-access';
import { navigationClusters, workspaceSection } from '@/lib/navigation';
import { hideAppChrome } from '@/lib/public-paths';
import { WorkspaceBrand, WorkspaceNavigation } from './WorkspaceSidebar';
import { useWorkspaces } from './WorkspaceProvider';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function SideNav() {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
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
    function refreshCount() { getPendingReceiptCount().then(count => {
      if (current) setInboxCount(count);
    }).catch(() => {}); }
    refreshCount();
    window.addEventListener('accountrix:documents-changed', refreshCount);
    return () => { current = false; window.removeEventListener('accountrix:documents-changed', refreshCount); };
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
      <header className="workspace-topbar max-sm:flex-wrap max-sm:py-2">
        <div className="flex min-w-0 items-center gap-2.5 text-sm max-sm:flex-1">
          <button ref={menuButton} type="button" className="workspace-button min-h-11 min-w-11 px-2 lg:hidden" aria-label="Open workspace navigation"
            aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(true)}>
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Link href="/" className="hidden rounded text-slate-600 hover:text-blue-800 sm:inline">Workspace</Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-slate-400 sm:inline" aria-hidden="true" />
          <span className="truncate font-semibold text-slate-950">{section?.name ?? 'Dashboard'}</span>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2 max-sm:contents"><button type="button" className="workspace-button max-sm:ml-auto" onClick={() => window.dispatchEvent(new Event('accountrix:open-ai'))}><MessageSquare className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Ask AI</span><span className="sr-only sm:hidden">Ask AI</span></button><WorkspaceSwitcher mobile /></div>
      </header>

      {menuOpen && <div onClick={closeMenu} className="fixed inset-0 z-40 bg-slate-950/55 lg:hidden" aria-hidden="true" />}
      <aside id="workspace-sidebar" className={`workspace-sidebar motion-safe:transition-transform lg:visible lg:translate-x-0 ${menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-5 pb-4">
          <WorkspaceBrand onClick={() => setMenuOpen(false)} />
          <button ref={closeButton} type="button" className="grid size-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Close workspace navigation" onClick={closeMenu}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <WorkspaceSwitcher />
        <WorkspaceNavigation pathname={pathname} inboxCount={inboxCount} onNavigate={() => setMenuOpen(false)} />

        <div className="flex shrink-0 items-center gap-2.5 border-t border-slate-300 px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-200 text-xs font-semibold text-slate-900" aria-hidden="true">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={name}>{name}</p>
            <p className="truncate text-xs text-slate-600 capitalize">{selected ? selected.role.toLowerCase() : 'Workspace'}</p>
          </div>
          <button type="button" disabled={signingOut} onClick={() => { setSigningOut(true); logout().catch(() => { setLogoutError('Sign-out could not reach the server. Try again.'); setSigningOut(false); }); }}
            aria-label="Log out" className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-950">
            <LogOut className="size-4" aria-hidden="true" />
          </button>
          {logoutError && <p role="alert" className="text-xs text-rose-800">{logoutError}</p>}
        </div>
      </aside>
    </>
  );
}
