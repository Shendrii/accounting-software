'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleAlert, Loader2 } from 'lucide-react';
import { AccessStatus } from '@/app/components/AccessStatus';
import { isAuthenticated, setSession, setWorkspaceId } from '@/lib/auth';
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

export default function OAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Prevent React Strict Mode double-invoke from clearing the session on the 2nd run
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // Capture hash BEFORE replaceState removes it
    const hash = window.location.hash;
    window.history.replaceState(null, '', window.location.pathname);

    const data = decodeSession(hash);

    if (!data?.token || !data.user) {
      // If session was already saved (first Strict Mode run succeeded), just go home
      if (isAuthenticated()) {
        router.replace('/');
        return;
      }
      setError('Missing session. Try signing in again.');
      return;
    }

    const workspaces = data.workspaces ?? [];
    setSession(data.token, data.user, workspaces);
    if (workspaces[0]) setWorkspaceId(workspaces[0].id);
    router.replace('/');
  }, [router]);

  if (error) {
    return (
      <AccessStatus title="Sign-in could not finish" description={error} icon={CircleAlert}>
        <Link href="/login" className="workspace-primary">Back to sign in</Link>
      </AccessStatus>
    );
  }

  return <AccessStatus title="Finishing sign-in…" description="Opening your workspace." icon={Loader2} pending />;
}
