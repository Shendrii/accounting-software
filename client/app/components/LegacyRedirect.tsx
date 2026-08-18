'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function LegacyRedirect({ to, preserveLastSegment = false }: { to: string; preserveLastSegment?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const target = preserveLastSegment ? `${to}/${pathname.split('/').filter(Boolean).at(-1)}` : to;

  useEffect(() => {
    router.replace(target);
  }, [router, target]);

  return null;
}
