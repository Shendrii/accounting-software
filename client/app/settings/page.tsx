'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, getWorkspaceId, setWorkspaceId } from '@/lib/auth';
import { createWorkspace, fetchWorkspaces, inviteWorkspaceMember, type AuthWorkspace } from '@/lib/api';

export default function SettingsPage() {
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [notice, setNotice] = useState('');
  const user = getCurrentUser();

  useEffect(() => {
    fetchWorkspaces().then(setWorkspaces).catch(() => {});
  }, []);

  async function addWorkspace() {
    if (!workspaceName.trim()) return;
    const workspace = await createWorkspace(workspaceName.trim());
    setWorkspaces((current) => [...current, workspace]);
    setWorkspaceId(workspace.id);
    setWorkspaceName('');
    setNotice(`Created and selected ${workspace.name}.`);
  }

  async function inviteMember() {
    const workspaceId = getWorkspaceId();
    if (!workspaceId || !inviteEmail.trim()) return;
    const invite = await inviteWorkspaceMember({ workspaceId, email: inviteEmail.trim(), role: 'MEMBER' });
    setInviteEmail('');
    setNotice(invite.emailSent ? 'Invite sent.' : `Invite created: ${invite.inviteUrl}`);
  }

  return (
    <div className="min-h-screen lg:pl-64">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Workspace, team, integration, and account controls.</p>
        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Account</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{user?.name ?? 'Signed in user'} · {user?.email ?? ''}</p>
        </section>
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Workspaces and team</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Create workspaces and invite collaborators here. The sidebar is only used to switch the active workspace.</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">{workspaces.map((workspace) => <li key={workspace.id}>{workspace.name} · {workspace.role}</li>)}</ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <form onSubmit={(event) => { event.preventDefault(); addWorkspace().catch((error) => setNotice(error.message)); }} className="flex gap-2">
              <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="New workspace name" className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
              <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">Create</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); inviteMember().catch((error) => setNotice(error.message)); }} className="flex gap-2">
              <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="member@example.com" className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
              <button className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Invite</button>
            </form>
          </div>
          {notice && <p className="mt-3 text-sm text-emerald-600">{notice}</p>}
        </section>
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Integrations</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Google sign-in and email delivery use the existing server configuration. No integration credentials are exposed in the client.</p>
        </section>
      </div>
    </div>
  );
}
