'use client';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { AccessStatus } from './AccessStatus';
import { confirmVerification, requestVerification, requestPasswordReset, resetPassword } from '@/lib/account-access';
import { useIsAuthenticated } from '@/lib/auth';

const subscribe = (callback: () => void) => { window.addEventListener('hashchange', callback); return () => window.removeEventListener('hashchange', callback); };
export default function AccountRecovery({ verify = false }: { verify?: boolean }) {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const token = new URLSearchParams(hash.slice(1)).get('token'); const signedIn = useIsAuthenticated();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const fields = new FormData(event.currentTarget);
    try {
      if (verify) {
        if (token) { await confirmVerification(token); setDone(true); setMessage('Email verified. You can return to your workspace.'); }
        else { await requestVerification(); setMessage('Check your inbox for a verification link. It expires in one hour.'); }
      } else if (token) { await resetPassword(token, String(fields.get('password'))); setDone(true); setMessage('Password updated. Sign in again; your previous sessions have been revoked.'); }
      else { await requestPasswordReset(String(fields.get('email'))); setMessage('If that account exists, a recovery link will arrive by email. It expires in one hour.'); }
      if (token) window.history.replaceState(null, '', window.location.pathname);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The account action could not finish.'); }
    finally { setBusy(false); }
  }
  return <AccessStatus title={verify ? 'Verify your email' : token ? 'Choose a new password' : 'Recover your password'} description={verify ? 'Confirm ownership before joining client workspaces or linking Google.' : 'Use an email recovery link to regain access to your account.'} icon={Mail}>
    {!done && <form onSubmit={submit} className="grid w-full gap-4 text-left">
      {!verify && !token && <label className="grid gap-2 text-sm font-semibold">Account email<input name="email" className="workspace-field" type="email" autoComplete="email" maxLength={254} required /></label>}
      {!verify && token && <label className="grid gap-2 text-sm font-semibold">New password<input name="password" className="workspace-field" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /><span className="font-normal text-slate-600">Use 8–128 characters.</span></label>}
      {verify && !token && !signedIn ? <Link className="workspace-primary" href="/login">Sign in to request verification</Link> : <button type="submit" className="workspace-primary" disabled={busy}>{busy ? 'Working…' : token ? verify ? 'Verify email' : 'Save new password' : verify ? 'Send verification email' : 'Send recovery link'}</button>}
    </form>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}{message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    <Link className="workspace-button" href={signedIn && verify ? '/settings' : '/login'}>{signedIn && verify ? 'Return to Settings' : 'Back to sign in'}</Link>
  </AccessStatus>;
}
