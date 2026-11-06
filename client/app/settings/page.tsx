'use client';

import { useState, type FormEvent } from 'react';
import { Building2, Mail, Plus, ScanText, UserRound, UserRoundPlus } from 'lucide-react';
import { getCurrentUser, setWorkspaceId, useActiveWorkspaceId } from '@/lib/auth';
import { createWorkspace, fetchWorkspaces, inviteWorkspaceMember } from '@/lib/api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import AccountingDialog from '@/app/components/AccountingDialog';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel, WorkspaceRow } from '@/app/components/WorkspaceUI';

export default function SettingsPage() {
  const workspaces = useWorkspaceData(fetchWorkspaces);
  const [dialog, setDialog] = useState<'workspace' | 'invite' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const user = getCurrentUser();
  const workspaceId = useActiveWorkspaceId();
  const current = workspaces.data?.find(workspace => workspace.id === workspaceId);

  function open(kind: 'workspace' | 'invite') {
    setError('');
    setDialog(kind);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !dialog) return;
    const value = String(new FormData(event.currentTarget).get('value')).trim();
    if (!value) {
      setError(dialog === 'workspace' ? 'Enter a workspace name.' : 'Enter an email address.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (dialog === 'workspace') {
        const workspace = await createWorkspace(value);
        setWorkspaceId(workspace.id);
        workspaces.retry();
        setNotice('Created and selected ' + workspace.name + '.');
      } else if (workspaceId) {
        const invite = await inviteWorkspaceMember({ workspaceId, email: value, role: 'MEMBER' });
        setNotice(invite.emailSent ? 'Invite sent.' : 'Invite created: ' + invite.inviteUrl);
      }
      setDialog(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This action could not finish.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-page">
      <div className="workspace-content space-y-5">
        <WorkspaceHeading section="Admin" title="Settings" description="Manage your account, workspaces, and integrations." />
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm break-words text-emerald-950">{notice}</p>}
        <div className="grid items-start gap-4 xl:grid-cols-[1fr_1.25fr]">
          <WorkspacePanel title="Account" description="The profile you use to sign in.">
            <WorkspaceRow icon={UserRound} title={user?.name ?? 'Signed in user'} detail={user?.email ?? 'Account email unavailable'} />
          </WorkspacePanel>
          <WorkspacePanel title="Workspaces and team" description="Create a workspace or invite someone to the active workspace.">
            {workspaces.error && <div className="p-4"><WorkspaceNotice title="Workspaces could not load" onRetry={workspaces.retry} /></div>}
            {workspaces.loading && <p role="status" className="p-4 text-sm text-slate-600">Loading workspaces…</p>}
            <div className="divide-y divide-slate-200">
              {workspaces.data?.map(workspace => <WorkspaceRow key={workspace.id} icon={Building2} title={workspace.name}
                detail={workspace.role.toLowerCase() + (workspace.id === workspaceId ? ' · Active workspace' : '')} />)}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-200 p-4">
              <button type="button" disabled={!workspaceId} className="workspace-primary" onClick={() => open('invite')}><UserRoundPlus className="size-4" aria-hidden="true" />Invite member</button>
              <button type="button" className="workspace-button" onClick={() => open('workspace')}><Plus className="size-4" aria-hidden="true" />New workspace</button>
            </div>
          </WorkspacePanel>
        </div>
        <WorkspacePanel title="Integrations" description="Services used by this workspace.">
          <div className="divide-y divide-slate-200">
            <WorkspaceRow icon={UserRound} title="Google sign-in" detail="Sign in to Accountrix with a Google account." />
            <WorkspaceRow icon={Mail} title="Email delivery" detail="Send invoices and workspace invitations." />
            <WorkspaceRow icon={ScanText} title="Receipt scanning" detail="Extract details from receipt images for review in Inbox." />
          </div>
        </WorkspacePanel>
        {dialog && <AccountingDialog title={dialog === 'invite' ? 'Invite a member' : 'New workspace'} busy={busy} onDismiss={() => setDialog(null)}>
          <form onSubmit={submit} className="space-y-4">
            {dialog === 'invite' && current && <p className="text-sm text-slate-600">Invite a member to {current.name}.</p>}
            <label className="grid gap-1.5 text-sm font-semibold">
              {dialog === 'invite' ? 'Email address' : 'Workspace name'}
              <input name="value" type={dialog === 'invite' ? 'email' : 'text'} className="workspace-field" required />
            </label>
            {error && <WorkspaceNotice title="This action could not finish">{error}</WorkspaceNotice>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={busy} className="workspace-button" onClick={() => setDialog(null)}>Cancel</button>
              <button type="submit" disabled={busy} className="workspace-primary">{busy ? 'Saving…' : dialog === 'invite' ? 'Send invite' : 'Create workspace'}</button>
            </div>
          </form>
        </AccountingDialog>}
      </div>
    </div>
  );
}
