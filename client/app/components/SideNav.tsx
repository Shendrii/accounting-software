'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  Plus,
  Loader2,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { createWorkspace, fetchWorkspaces, getReceipts, inviteWorkspaceMember, type AuthWorkspace } from '@/lib/api';
import { getCurrentUser, getWorkspaceId, isAuthenticated, setWorkspaceId } from '@/lib/auth';
import { navigationClusters, type NavigationItem } from '@/lib/navigation';
import { hideAppChrome } from '@/lib/public-paths';
import { PRODUCT_NAME } from '@/lib/brand';

/* ── Reusable modal dialog ─────────────────────────────────────────────── */
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NavSection({
  title,
  items,
  pathname,
  onClose,
  inboxCount,
}: {
  title: string;
  items: NavigationItem[];
  pathname: string;
  onClose: () => void;
  inboxCount: number;
}) {
  return (
    <div className="mb-4">
      <p className="px-4 py-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
        {title}
      </p>
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-50'
            )}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.name}</span>
            {item.badge === 'inbox' && inboxCount > 0 && (
              <span className="ml-auto min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-xs font-semibold text-white">
                {inboxCount > 99 ? '99+' : inboxCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default function SideNav() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [workspaceId, setWs] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [inboxCount, setInboxCount] = useState(0);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  // New workspace modal
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsLoading, setNewWsLoading] = useState(false);
  const [newWsError, setNewWsError] = useState('');

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');

  const newWsInputRef = useRef<HTMLInputElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);

  const closeMenu = () => setIsMobileMenuOpen(false);

  // Close workspace dropdown when clicking outside
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
      setWsDropdownOpen(false);
    }
  }, []);

  useEffect(() => {
    if (wsDropdownOpen) document.addEventListener('mousedown', handleOutsideClick);
    else document.removeEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [wsDropdownOpen, handleOutsideClick]);

  useEffect(() => {
    if (hideAppChrome(pathname, isAuthenticated()) || !isAuthenticated()) return;

    const me = getCurrentUser();
    if (me?.name) setCurrentUserName(me.name);
    setWs(getWorkspaceId());
    fetchWorkspaces()
      .then((rows) => {
        setWorkspaces(rows);
        if (!getWorkspaceId() && rows[0]) {
          setWorkspaceId(rows[0].id);
          setWs(rows[0].id);
        }
      })
      .catch(() => {});
    getReceipts('PENDING').then((receipts) => setInboxCount(receipts.length)).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (showNewWs) { setNewWsName(''); setNewWsError(''); setTimeout(() => newWsInputRef.current?.focus(), 50); }
  }, [showNewWs]);

  useEffect(() => {
    if (showInvite) { setInviteEmail(''); setInviteMsg(''); setInviteError(''); setTimeout(() => inviteInputRef.current?.focus(), 50); }
  }, [showInvite]);

  async function onCreateWorkspace() {
    if (!newWsName.trim()) { setNewWsError('Please enter a workspace name.'); return; }
    setNewWsLoading(true);
    setNewWsError('');
    try {
      const ws = await createWorkspace(newWsName.trim());
      setWorkspaces((prev) => [...prev, ws]);
      setWorkspaceId(ws.id);
      setWs(ws.id);
      setShowNewWs(false);
      window.location.reload();
    } catch (e: unknown) {
      setNewWsError(e instanceof Error ? e.message : 'Failed to create workspace');
    } finally {
      setNewWsLoading(false);
    }
  }

  async function onInviteMember() {
    if (!inviteEmail.trim()) { setInviteError('Please enter an email address.'); return; }
    if (!workspaceId) return;
    setInviteLoading(true);
    setInviteError('');
    setInviteMsg('');
    try {
      const invite = await inviteWorkspaceMember({ workspaceId, email: inviteEmail.trim(), role: 'MEMBER' });
      if (invite.emailSent) {
        setInviteMsg(`Invite sent to ${inviteEmail.trim()}!`);
      } else {
        setInviteMsg(`Invite created. Share this link:\n${invite.inviteUrl}`);
      }
      setInviteEmail('');
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : 'Failed to invite member');
    } finally {
      setInviteLoading(false);
    }
  }

  function onWorkspaceChange(nextId: string) {
    setWorkspaceId(nextId);
    setWs(nextId);
    window.location.reload();
  }

  if (hideAppChrome(pathname, isAuthenticated())) return null;

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? (
            <X className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
          ) : (
            <Menu className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
          )}
        </button>
      </div>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-svh w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-950',
          'lg:translate-x-0',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Logo/Brand */}
          <div className="h-16 flex items-center px-6 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{PRODUCT_NAME}</h1>
          </div>

          <div className="px-4 py-4 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
            {/* Custom workspace picker */}
            <div ref={wsDropdownRef} className="relative">
              <button
                onClick={() => setWsDropdownOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="truncate text-left text-zinc-900 dark:text-zinc-50">
                  {workspaces.find((w) => w.id === workspaceId)?.name ?? 'Select workspace'}
                </span>
                <svg className={cn('h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform', wsDropdownOpen && 'rotate-180')} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {wsDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => { onWorkspaceChange(ws.id); setWsDropdownOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors',
                        ws.id === workspaceId ? 'text-zinc-900 dark:text-zinc-50 font-medium' : 'text-zinc-600 dark:text-zinc-400'
                      )}
                    >
                      <span className="flex-1 truncate">{ws.name}</span>
                      <span className="text-xs text-zinc-400 flex-shrink-0">{ws.type}</span>
                      {ws.id === workspaceId && (
                        <svg className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <Link
              href="/"
              onClick={closeMenu}
              className={cn(
                'mb-4 flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
                pathname === '/' ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-50'
              )}
            >
              Overview
            </Link>
            {navigationClusters.map((cluster, index) => (
              <div key={cluster.label} className={index ? 'border-t border-zinc-100 pt-4 dark:border-zinc-800' : ''}>
                <NavSection title={cluster.label} items={cluster.items} pathname={pathname} onClose={closeMenu} inboxCount={inboxCount} />
              </div>
            ))}
          </nav>

        </div>

          {/* Profile pinned to bottom-left */}
          <div className="shrink-0 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-900">
                {(currentUserName || 'A')
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {currentUserName || 'Signed in'}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {workspaces.find((w) => w.id === workspaceId)?.name ?? 'Workspace'}
                </p>
              </div>
            </div>
          </div>
      </aside>

      {/* Spacer for desktop */}
      <div className="hidden lg:block w-64 flex-shrink-0" />

      {/* New Workspace Modal */}
      {showNewWs && (
        <Modal title="New Workspace" onClose={() => setShowNewWs(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Workspace name</label>
              <input
                ref={newWsInputRef}
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onCreateWorkspace()}
                placeholder="e.g. My Business"
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>
            {newWsError && <p className="text-sm text-red-600">{newWsError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowNewWs(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={onCreateWorkspace}
                disabled={newWsLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
              >
                {newWsLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Invite Member Modal */}
      {showInvite && (
        <Modal title="Invite Member" onClose={() => setShowInvite(false)}>
          <div className="space-y-3">
            {inviteMsg ? (
              <>
                <p className="text-sm text-emerald-600 dark:text-emerald-400 whitespace-pre-wrap">{inviteMsg}</p>
                <button
                  onClick={() => setShowInvite(false)}
                  className="w-full px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email address</label>
                  <input
                    ref={inviteInputRef}
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onInviteMember()}
                    placeholder="colleague@example.com"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  />
                </div>
                {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowInvite(false)}
                    className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onInviteMember}
                    disabled={inviteLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
                  >
                    {inviteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send Invite
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
