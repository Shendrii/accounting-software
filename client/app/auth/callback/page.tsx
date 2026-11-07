'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleAlert, Loader2 } from 'lucide-react';
import { AccessStatus } from '@/app/components/AccessStatus';
import { isAuthenticated, setSession, setWorkspaceId, useIsAuthenticated } from '@/lib/auth';
import type { AuthUser, AuthWorkspace } from '@/lib/api';

function decodeSession(hash: string): {
  token: string;
  user: AuthUser;
  workspaces: AuthWorkspace[];
} | null {
  const match = /#session=([^&]+)/.exec(hash);
  if (!match) return null;
  const segment = match[1];
  try {
    const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as { token: string; user: AuthUser; workspaces: AuthWorkspace[] };
  } catch {
    return null;
  }
}

function subscribeToHash(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
function readHash() { return window.location.hash; }

export default function OAuthCallbackPage() {
  const router = useRouter();
  const hash = useSyncExternalStore<string | null>(subscribeToHash, readHash, () => null);
  const data = useMemo(() => decodeSession(hash ?? ''), [hash]);
  const signedIn = useIsAuthenticated();
  // Prevent React Strict Mode double-invoke from clearing the session on the 2nd run
  const handled = useRef(false);

  useEffect(() => {
    if (hash === null || handled.current) return;
    handled.current = true;

    // The URL snapshot was captured before removing the credential fragment.
    window.history.replaceState(null, '', window.location.pathname);

    if (!data?.token || !data.user) {
      // Reuse an existing session when the callback has no new credentials.
      if (isAuthenticated()) {
        router.replace('/');
        return;
      }
      return;
    }

    const workspaces = data.workspaces ?? [];
    setSession(data.token, data.user, workspaces);
    if (workspaces[0]) setWorkspaceId(workspaces[0].id);
    router.replace(workspaces[0]?.setupCompletedAt === null ? '/settings/setup' : '/');
  }, [hash, data, router]);

  if (hash !== null && (!data?.token || !data.user) && !signedIn) {
    return (
      <AccessStatus title="Sign-in could not finish" description="Missing session. Try signing in again." icon={CircleAlert}>
        <Link href="/login" className="workspace-primary">Back to sign in</Link>
      </AccessStatus>
    );
  }

  return <AccessStatus title="Finishing sign-in…" description="Opening your workspace." icon={Loader2} pending />;
}
