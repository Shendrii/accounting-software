'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, XCircle, Users } from 'lucide-react';
import { AccessStatus } from '@/app/components/AccessStatus';
import { acceptWorkspaceInvite, fetchWorkspaces } from '@/lib/api';
import { isAuthenticated, setWorkspaceId } from '@/lib/auth';

type State = 'loading' | 'needs_login' | 'accepting' | 'success' | 'error';

function InvitePageContent() {
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

  if (state === 'loading' || state === 'accepting') {
    return <AccessStatus title={state === 'accepting' ? 'Accepting invitation…' : 'Loading invitation…'} icon={Loader2} pending />;
  }

  if (state === 'needs_login') {
    const redirect = encodeURIComponent('/invite?token=' + encodeURIComponent(token));
    return (
      <AccessStatus title="Workspace invitation" description="Sign in or create an account to accept this invitation." icon={Users}>
        <div className="flex flex-wrap gap-2">
          <Link href={'/login?redirect=' + redirect} className="workspace-primary">Sign in</Link>
          <Link href={'/signup?redirect=' + redirect} className="workspace-button">Create account</Link>
        </div>
      </AccessStatus>
    );
  }

  if (state === 'success') {
    return (
      <AccessStatus title="You’ve joined the workspace" description="Your workspace is ready to open." icon={CheckCircle}>
        <button type="button" onClick={() => { window.location.href = '/'; }} className="workspace-primary">Go to overview</button>
      </AccessStatus>
    );
  }

  return (
    <AccessStatus title="Invitation could not be accepted" description={message || 'This invitation may have expired or already been used.'} icon={XCircle}>
      <Link href="/" className="workspace-button">Back to home</Link>
    </AccessStatus>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<AccessStatus title="Loading invitation…" icon={Loader2} pending />}>
      <InvitePageContent />
    </Suspense>
  );
}
