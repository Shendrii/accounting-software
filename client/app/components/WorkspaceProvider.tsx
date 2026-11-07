'use client';

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createWorkspace, fetchWorkspaces, type AuthWorkspace } from '@/lib/api';
import { getCurrentUser, getWorkspaceId, setWorkspaceId, useActiveWorkspaceId, useIsAuthenticated, WORKSPACE_KEY } from '@/lib/auth';
import { hideAppChrome } from '@/lib/public-paths';
import { toast } from '@/lib/toast';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import AccountingDialog from './AccountingDialog';
import { WorkspaceNotice } from './WorkspaceUI';

type WorkspaceContextValue = {
  workspaces: AuthWorkspace[];
  active?: AuthWorkspace;
  loading: boolean;
  error: boolean;
  retry: () => void;
  selectWorkspace: (workspace: AuthWorkspace) => void;
  openCreate: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const flashKey = 'accountrix:workspace-flash';

export function useWorkspaces() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('WorkspaceProvider is missing');
  return context;
}

function switchDestination() {
  const { pathname, search, hash } = window.location;
  if (/^\/(?:sales\/)?invoices\/[^/]+\/?$/.test(pathname)) return '/sales/invoices';
  if (/^\/(?:purchases\/)?bills\/[^/]+\/?$/.test(pathname)) return '/purchases/bills';
  const params = new URLSearchParams(search);
  if ((pathname === '/ledger' || pathname === '/bookkeeping') && params.has('new')) {
    params.delete('new');
    const query = params.toString();
    return pathname + (query ? '?' + query : '');
  }
  return pathname + search + hash;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const signedIn = useIsAuthenticated();
  const userId = signedIn ? getCurrentUser()?.id : undefined;
  const activeId = useActiveWorkspaceId();
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return [];
    const rows = await fetchWorkspaces();
    if (getCurrentUser()?.id !== userId) return [];
    const selected = getWorkspaceId();
    if (!selected && rows[0]) setWorkspaceId(rows[0].id);
    return rows;
  }, [userId]);
  const query = useWorkspaceData(load);
  const workspaces = query.data ?? [];
  const active = workspaces.find(workspace => workspace.id === activeId);

  function navigateToWorkspace(workspace: Pick<AuthWorkspace, 'id' | 'name'>, created = false) {
    const destination = created ? '/settings/setup' : switchDestination();
    setSwitching(true);
    try {
      sessionStorage.setItem(flashKey, (created ? 'Created and switched to ' : 'Switched to ') + workspace.name);
    } catch {
      // The switch can still proceed without a notification.
    }
    setWorkspaceId(workspace.id);
    window.location.assign(destination);
  }

  useEffect(() => {
    if (!signedIn) return;
    const message = sessionStorage.getItem(flashKey);
    if (message) {
      sessionStorage.removeItem(flashKey);
      toast.success(message);
    }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || hideAppChrome(pathname, signedIn)) return;
    function onStorage(event: StorageEvent) {
      if (event.key === WORKSPACE_KEY && event.newValue && event.oldValue !== event.newValue) {
        window.location.assign(switchDestination());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pathname, signedIn]);

  return (
    <WorkspaceContext.Provider value={{
      workspaces, active, loading: query.loading, error: query.error, retry: query.retry,
      selectWorkspace: workspace => {
        if (workspace.id !== activeId) navigateToWorkspace(workspace);
      },
      openCreate: () => setCreating(true),
    }}>
      {signedIn && active && active.setupCompletedAt === null && !pathname.startsWith('/settings') && !hideAppChrome(pathname, signedIn) && <div className="workspace-page py-3"><div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-300 py-3 text-sm"><p>Confirm the country, currency and opening books for <strong>{active.name}</strong>.</p><Link className="workspace-text-action" href="/settings/setup">Finish workspace setup</Link></div></div>}
      {signedIn && !hideAppChrome(pathname, signedIn) && query.loading && !active ? <div role="status" className="grid min-h-screen place-items-center p-6 text-sm text-slate-600">Opening client workspace…</div> : children}
      {switching && <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-50 p-4 text-sm text-slate-700" role="status">Opening workspace…</div>}
      {creating && <CreateWorkspaceDialog workspaces={workspaces} onDismiss={() => setCreating(false)}
        onCreate={workspace => navigateToWorkspace(workspace, true)} />}
    </WorkspaceContext.Provider>
  );
}

function CreateWorkspaceDialog({ workspaces, onDismiss, onCreate }: {
  workspaces: AuthWorkspace[];
  onDismiss: () => void;
  onCreate: (workspace: Pick<AuthWorkspace, 'id' | 'name'>) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name) { setError('Enter a workspace name.'); return; }
    if (workspaces.some(workspace => workspace.name.toLowerCase() === name.toLowerCase())) {
      setError('You already have a workspace with this name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onCreate(await createWorkspace(name));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create workspace.');
      setBusy(false);
    }
  }

  return (
    <AccountingDialog title="Create a team workspace" busy={busy} onDismiss={onDismiss}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">Start a separate set of books. You’ll be the workspace owner.</p>
        <label className="grid gap-1.5 text-sm font-semibold">Workspace name
          <input name="name" maxLength={70} placeholder="e.g. Harbor Studio" className="workspace-field" autoFocus required disabled={busy} />
        </label>
        {error && <WorkspaceNotice title="Could not create workspace">{error}</WorkspaceNotice>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="workspace-button" onClick={onDismiss} disabled={busy}>Cancel</button>
          <button type="submit" className="workspace-primary" disabled={busy}>{busy ? 'Creating workspace…' : 'Create and switch'}</button>
        </div>
      </form>
    </AccountingDialog>
  );
}
