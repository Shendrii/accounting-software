'use client';
import Link from 'next/link';

import { useCallback, useState, type FormEvent } from 'react';
import { ArrowRight, Copy, Mail, Plus, ScanText, UserRound, UserRoundPlus } from 'lucide-react';
import { fetchWorkspaceInvitations, fetchWorkspaceMembers, inviteWorkspaceMember, type AuthWorkspace } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import AccountingDialog from '@/app/components/AccountingDialog';
import AccountSecurity from '@/app/components/AccountSecurity';
import PostingControls from '@/app/components/PostingControls';
import AuditHistory from '@/app/components/AuditHistory';
import MemberRoleEditor from '@/app/components/MemberRoleEditor';
import { useWorkspaces } from '@/app/components/WorkspaceProvider';
import { WorkspaceActiveBadge, WorkspaceAvatar, WorkspaceRole } from '@/app/components/WorkspaceSwitcher';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel, WorkspaceRow } from '@/app/components/WorkspaceUI';

export default function SettingsPage() {
  const { workspaces, active, loading, error, retry, selectWorkspace, openCreate } = useWorkspaces();
  const user = getCurrentUser();

  return (
    <div className="workspace-page">
      <div className="workspace-content space-y-5">
        <WorkspaceHeading section="Admin" title="Settings" description="Manage your account, workspaces, and integrations." />
        <AccountSecurity />
        <PostingControls />
        <WorkspacePanel title="Business profile and opening books" description={active ? 'Country, currency and bookkeeping setup for ' + active.name + '.' : 'Choose a workspace to configure its books.'}><div className="flex flex-wrap gap-3 p-4"><Link href="/settings/setup" className="workspace-primary">Business profile</Link><Link href="/settings/opening-balances" className="workspace-button">Opening balances</Link></div></WorkspacePanel>
        <section id="workspaces" aria-labelledby="workspace-settings-heading" className="scroll-mt-4 space-y-3">
          <div>
            <h2 id="workspace-settings-heading" className="text-xl font-semibold tracking-tight">Workspaces and team</h2>
            <p className="mt-1 text-sm text-slate-600">{active ? 'Manage access for ' + active.name + '.' : 'Choose a workspace to see its team.'}</p>
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <WorkspacePanel title="Your workspaces"
              action={<button type="button" className="workspace-primary" onClick={openCreate}><Plus className="size-4" aria-hidden="true" />New workspace</button>}>
              {error && <div className="p-4"><WorkspaceNotice title="Workspaces could not load" onRetry={retry} /></div>}
              {loading && <p role="status" className="p-4 text-sm text-slate-600">Loading workspaces…</p>}
              {!loading && !error && !workspaces.length && <p className="p-4 text-sm text-slate-600">Create a workspace to get started.</p>}
              <ul className="divide-y divide-slate-200">
                {workspaces.map(workspace => <li key={workspace.id} className="flex items-center gap-3 p-4">
                  <WorkspaceAvatar name={workspace.name} type={workspace.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold break-words">{workspace.name}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{workspace.type === 'PERSONAL' ? 'Personal' : 'Team'} · <WorkspaceRole role={workspace.role} /></p>
                  </div>
                  {workspace.id === active?.id ? <WorkspaceActiveBadge /> :
                    <button type="button" className="workspace-button shrink-0" onClick={() => selectWorkspace(workspace)}
                      aria-label={'Switch to ' + workspace.name}><ArrowRight className="size-4" aria-hidden="true" />Switch</button>}
                </li>)}
              </ul>
            </WorkspacePanel>
            {active && <WorkspaceTeam key={active.id} workspace={active} />}
          </div>
        </section>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <WorkspacePanel title="Account" description="The profile you use to sign in.">
            <WorkspaceRow icon={UserRound} title={user?.name ?? 'Signed in user'} detail={user?.email ?? 'Account email unavailable'} />
          </WorkspacePanel>
          <WorkspacePanel title="Integrations" description="Services used by this workspace.">
            <div className="divide-y divide-slate-200">
              <WorkspaceRow icon={UserRound} title="Google sign-in" detail="Sign in to Accountrix with a Google account." />
              <WorkspaceRow icon={Mail} title="Email delivery" detail="Send invoices and workspace invitations." />
              <WorkspaceRow icon={ScanText} title="Receipt scanning" detail="Extract details from receipt images for review in Inbox." />
            </div>
          </WorkspacePanel>
        </div>
        <AuditHistory />
      </div>
    </div>
  );
}

function WorkspaceTeam({ workspace }: { workspace: AuthWorkspace }) {
  const canInvite = workspace.role === 'OWNER' || workspace.role === 'ADMIN';
  const loadMembers = useCallback(() => fetchWorkspaceMembers(workspace.id), [workspace.id]);
  const loadInvitations = useCallback(() => canInvite ? fetchWorkspaceInvitations(workspace.id) : Promise.resolve([]), [workspace.id, canInvite]);
  const members = useWorkspaceData(loadMembers);
  const invitations = useWorkspaceData(loadInvitations);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<{ message: string; shareUrl?: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  async function copyLink() {
    if (!notice?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(notice.shareUrl);
      setCopyStatus('Link copied.');
    } catch {
      setCopyStatus('Select and copy the link from the field.');
    }
  }

  return (
    <WorkspacePanel title="Team members" description={workspace.name}
      action={canInvite && <button type="button" className="workspace-button" onClick={() => setInviting(true)}>
        <UserRoundPlus className="size-4" aria-hidden="true" />Invite member
      </button>}>
      {notice && <div className="space-y-2 border-b border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <p role="status" className="font-semibold">{notice.message}</p>
        {notice.shareUrl && <div className="flex flex-wrap gap-2">
          <input className="workspace-field min-w-32 flex-1" aria-label="Invitation link" readOnly value={notice.shareUrl} onFocus={event => event.currentTarget.select()} />
          <button type="button" className="workspace-button" onClick={copyLink}><Copy className="size-4" aria-hidden="true" />Copy link</button>
          {copyStatus && <p className="w-full text-xs" role="status">{copyStatus}</p>}
        </div>}
      </div>}
      {members.loading && <p role="status" className="p-4 text-sm text-slate-600">Loading members…</p>}
      {members.error && <div className="p-4"><WorkspaceNotice title="Team members could not load" onRetry={members.retry} /></div>}
      <ul className="divide-y divide-slate-200">
        {members.data?.map(member => <li key={member.id} className="flex items-center gap-3 p-4">
          <WorkspaceAvatar name={member.user.name || member.user.email} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold break-words">{member.user.name || member.user.email}</p>
            <p className="text-xs break-words text-slate-600">{member.user.email}</p>
          </div>
          <span className="text-xs font-semibold text-slate-700"><WorkspaceRole role={member.role} /></span>{canInvite && member.role !== 'OWNER' && <MemberRoleEditor workspace={workspace} member={member} onSaved={members.retry} />}
        </li>)}
      </ul>
      {canInvite ? <section className="border-t border-slate-200 p-4">
        <h3 className="text-sm font-semibold">Pending invitations</h3>
        {invitations.loading && <p role="status" className="mt-2 text-xs text-slate-600">Loading invitations…</p>}
        {invitations.error && <div className="mt-2"><WorkspaceNotice title="Pending invitations could not load" onRetry={invitations.retry} /></div>}
        {invitations.data?.length === 0 && <p className="mt-2 text-xs text-slate-600">No pending invitations.</p>}
        {!!invitations.data?.length && <ul className="mt-2 divide-y divide-slate-200">
          {invitations.data.map(invitation => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 font-medium break-all">{invitation.email}</span>
            <span className="text-xs text-slate-600"><WorkspaceRole role={invitation.role} /> · Expires {invitation.expiresAt.slice(0, 10)}</span>
          </li>)}
        </ul>}
      </section> : <p className="border-t border-slate-200 p-4 text-xs text-slate-600">Owners and admins can invite members.</p>}
      {inviting && <InviteDialog workspace={workspace} onDismiss={() => setInviting(false)}
        onSent={({ email, emailSent, inviteUrl }) => {
          setInviting(false);
          setCopyStatus('');
          setNotice(emailSent ? { message: 'Invitation sent to ' + email + '.' } :
            { message: 'Invitation created. Share this link with ' + email + '.', shareUrl: inviteUrl });
          invitations.retry();
        }} />}
    </WorkspacePanel>
  );
}

function InviteDialog({ workspace, onDismiss, onSent }: {
  workspace: AuthWorkspace;
  onDismiss: () => void;
  onSent: (result: { email: string; emailSent: boolean; inviteUrl: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get('email') ?? '').trim();
    const role = String(fields.get('role')) as Exclude<AuthWorkspace['role'], 'OWNER'>;
    setBusy(true);
    setError('');
    try {
      const result = await inviteWorkspaceMember({ workspaceId: workspace.id, email, role });
      onSent({ email, emailSent: result.emailSent, inviteUrl: result.inviteUrl });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create invitation.');
      setBusy(false);
    }
  }

  return <AccountingDialog title="Invite a member" busy={busy} onDismiss={onDismiss}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">Invite someone to {workspace.name} with the access role selected below.</p>
      <label className="grid gap-1.5 text-sm font-semibold">Email address
        <input name="email" type="email" autoComplete="email" placeholder="colleague@example.com" className="workspace-field" autoFocus required disabled={busy} />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">Access role<select name="role" className="workspace-field" defaultValue="MEMBER" disabled={busy}><option value="MEMBER">Bookkeeper — prepare drafts</option><option value="APPROVER">Reviewer — post and correct</option><option value="VIEWER">Read only — inspect records and reports</option>{workspace.role === 'OWNER' && <option value="ADMIN">Admin — manage books and team</option>}</select></label>
      {error && <WorkspaceNotice title="Could not create invitation">{error}</WorkspaceNotice>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="workspace-button" onClick={onDismiss} disabled={busy}>Cancel</button>
        <button type="submit" className="workspace-primary" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
      </div>
    </form>
  </AccountingDialog>;
}
