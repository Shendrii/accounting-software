'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { acceptWorkspaceInvite, fetchWorkspaces } from '@/lib/api';
import { isAuthenticated, setWorkspaceId } from '@/lib/auth';

type State = 'loading' | 'needs_login' | 'accepting' | 'success' | 'error';

export default function InvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Invalid invite link — no token found.');
      return;
    }

    if (!isAuthenticated()) {
      setState('needs_login');
      return;
    }

    setState('accepting');
    acceptWorkspaceInvite(token)
      .then(async () => {
        // Refresh workspaces and switch to the new one
        try {
          const workspaces = await fetchWorkspaces();
          if (workspaces.length > 0) {
            const last = workspaces[workspaces.length - 1];
            setWorkspaceId(last.id);
          }
        } catch {
          // non-critical
        }
        setState('success');
      })
      .catch((e: unknown) => {
        setState('error');
        setMessage(e instanceof Error ? e.message : 'Failed to accept invite.');
      });
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (state === 'needs_login') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-50 dark:bg-zinc-950">
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm text-center space-y-4">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">You have been invited</h1>
          <p className="text-sm text-zinc-500">Sign in or create an account to accept this workspace invitation.</p>
          <div className="flex flex-col gap-2">
            <Link
              href={`/login?redirect=/invite?token=${token}`}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium text-center"
            >
              Sign in
            </Link>
            <Link
              href={`/signup?redirect=/invite?token=${token}`}
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-center text-zinc-900 dark:text-zinc-50"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'accepting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        <p className="text-sm text-zinc-500">Accepting invitation…</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-50 dark:bg-zinc-950">
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm text-center space-y-4">
          <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">You&apos;re in!</h1>
          <p className="text-sm text-zinc-500">You have successfully joined the workspace.</p>
          <button
            onClick={() => { window.location.href = '/'; }}
            className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm text-center space-y-4">
        <XCircle className="h-10 w-10 text-red-500 mx-auto" />
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Invite failed</h1>
        <p className="text-sm text-zinc-500">{message || 'This invite may have expired or already been used.'}</p>
        <Link href="/" className="block w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Back to home
        </Link>
      </div>
    </div>
  );
}
