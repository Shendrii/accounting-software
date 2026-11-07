'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, XCircle, Users } from 'lucide-react';
import { AccessStatus } from '@/app/components/AccessStatus';
import { acceptWorkspaceInvite, fetchWorkspaces } from '@/lib/api';
import { getToken, useAuthToken, setWorkspaceId } from '@/lib/auth';

type State = 'needs_login' | 'accepting' | 'success' | 'error';

function InvitePageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const session = useAuthToken();
  const [result, setResult] = useState<{ token: string; session: string; state: 'success' | 'error'; message?: string } | null>(null);
  const acceptance = useRef<{ token: string; session: string; promise: ReturnType<typeof acceptWorkspaceInvite> } | null>(null);
  const state: State = !token ? 'error' : !session ? 'needs_login' : result?.token === token && result.session === session ? result.state : 'accepting';
  const message = !token ? 'Invalid invite link — no token found.' : result?.token === token && result.session === session ? result.message : '';

  useEffect(() => {
    if (!token || !session) return;
    let current = true;
    // Strict Mode may resubscribe; an invitation must only be accepted once.
    if (acceptance.current?.token !== token || acceptance.current.session !== session) {
      acceptance.current = { token, session, promise: acceptWorkspaceInvite(token) };
    }
    acceptance.current.promise.then(async () => {
      if (!current || getToken() !== session) return;
      const workspaces = await fetchWorkspaces().catch(() => []);
      if (!current || getToken() !== session) return;
      const last = workspaces[workspaces.length - 1];
      if (last) setWorkspaceId(last.id);
      setResult({ token, session, state: 'success' });
    }).catch((error: unknown) => {
      if (current && getToken() === session) setResult({ token, session, state: 'error', message: error instanceof Error ? error.message : 'Failed to accept invite.' });
    });
    return () => { current = false; };
  }, [token, session]);

  if (state === 'accepting') {
    return <AccessStatus title="Accepting invitation…" icon={Loader2} pending />;
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
