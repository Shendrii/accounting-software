'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleAlert, Loader2 } from 'lucide-react';
import { AccessStatus } from '@/app/components/AccessStatus';
import { setSession } from '@/lib/auth';
import { completeGoogleSignIn } from '@/lib/account-access';

export default function OAuthCallbackPage() {
  const router = useRouter(); const started = useRef(false); const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return; started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    const ticket = params.get('ticket');
    const completion = params.get('error') === 'account_exists' ? Promise.reject(new Error('This email already has an account. Sign in with your password, or reset it by email. Link Google from Settings after verifying your email.')) :
      !ticket || params.getAll('ticket').length !== 1 ? Promise.reject(new Error('Start sign-in again from Accountrix.')) : completeGoogleSignIn(ticket);
    completion.then(data => {
      setSession(data.token, data.user, data.workspaces);
      router.replace(data.workspaces?.[0]?.setupCompletedAt === null ? '/settings/setup' : '/');
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Sign-in could not finish.'));
  }, [router]);
  if (error) return <AccessStatus title="Sign-in could not finish" description={error} icon={CircleAlert}><Link href="/login" className="workspace-primary">Back to sign in</Link><Link href="/reset-password" className="workspace-button">Recover password</Link></AccessStatus>;
  return <AccessStatus title="Finishing sign-in…" description="Opening your workspace." icon={Loader2} pending />;
}
