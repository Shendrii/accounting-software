'use client';
import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { fetchMe } from '@/lib/api';
import { beginGoogleSignIn } from '@/lib/account-access';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { WorkspaceNotice, WorkspacePanel } from './WorkspaceUI';

export default function AccountSecurity() {
  const load = useCallback(() => fetchMe(), []); const state = useWorkspaceData(load);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await beginGoogleSignIn(String(new FormData(event.currentTarget).get('password'))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Google could not link.'); setBusy(false); }
  }
  return <WorkspacePanel title="Account security" description="Email ownership, account recovery, and deliberate provider linking.">
    <div className="space-y-4 p-4 sm:p-5">
      {state.error && <WorkspaceNotice title="Account status could not load" onRetry={state.retry} />}
      {state.loading && <p role="status">Loading account status…</p>}
      {state.data && <><p className="text-sm">{state.data.user.email} · {state.data.user.emailVerifiedAt ? 'Email verified' : 'Email not verified'}</p>
        {!state.data.user.emailVerifiedAt && <Link className="workspace-button" href="/verify-email">Verify email</Link>}
        <Link className="workspace-text-action" href="/reset-password">Recover or change password by email</Link>
        <form onSubmit={link} className="grid max-w-md gap-3"><label className="grid gap-1.5 text-sm font-semibold">Current password<input type="password" name="password" autoComplete="current-password" className="workspace-field" required /></label>
          <p className="text-xs text-slate-600">Link the Google account with this same verified email. Existing Google users can continue signing in with Google.</p>
          <button type="submit" className="workspace-button" disabled={busy || !state.data.user.emailVerifiedAt}>{busy ? 'Starting Google…' : 'Link Google account'}</button>
        </form></>}
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    </div>
  </WorkspacePanel>;
}
