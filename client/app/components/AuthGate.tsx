'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

const PUBLIC_PATHS = new Set(['/login', '/signup', '/auth/callback', '/invite']);
/** Logged-in users hitting these are sent home (OAuth callback stays reachable while finishing sign-in). */
const LOGIN_SIGNUP_PATHS = new Set(['/login', '/signup']);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const authed = isAuthenticated();
    const isPublic = PUBLIC_PATHS.has(pathname);

    if (!authed && !isPublic) {
      router.replace('/login');
      return;
    }
    if (authed && LOGIN_SIGNUP_PATHS.has(pathname)) {
      router.replace('/');
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }
  return <>{children}</>;
}

