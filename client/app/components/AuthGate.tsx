'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { isPublicPath } from '@/lib/public-paths';

const LOGIN_SIGNUP_PATHS = new Set(['/login', '/signup']);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isPublic = pathname ? isPublicPath(pathname) : false;

  useEffect(() => {
    if (!pathname || isPublicPath(pathname)) return;

    const authed = isAuthenticated();
    if (!authed) {
      router.replace('/login');
      return;
    }
    if (LOGIN_SIGNUP_PATHS.has(pathname)) {
      router.replace('/');
      return;
    }
    setReady(true);
  }, [pathname, router]);

  // Public routes (landing, portfolio previews) render immediately — no auth redirect.
  if (isPublic) {
    return <>{children}</>;
  }

  if (!pathname) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }
  return <>{children}</>;
}
