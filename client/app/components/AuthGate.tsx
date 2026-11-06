'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated, useIsAuthenticated } from '@/lib/auth';
import { isPublicPath } from '@/lib/public-paths';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = useIsAuthenticated();
  const isPublic = pathname ? isPublicPath(pathname) : false;

  useEffect(() => {
    if (pathname && !isPublic && !isAuthenticated()) router.replace('/login');
  }, [pathname, isPublic, router, signedIn]);

  if (isPublic || signedIn) return <>{children}</>;
  return <div className="grid min-h-screen place-items-center text-slate-600" role="status">Opening workspace…</div>;
}
