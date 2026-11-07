'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
function Back({ fallback, label, className }: { fallback: string; label: string; className?: string }) {
  const requested = useSearchParams().get('returnTo');
  const safe = requested && !requested.includes('\\') && ['/sales/invoices', '/purchases/bills', '/reports'].some(path => requested === path || requested.startsWith(path + '?'));
  return <Link className={className || 'workspace-button'} href={safe ? requested : fallback}>← {safe && requested.startsWith('/reports') ? 'Return to report' : label}</Link>;
}
export default function BackToWorklist(props: { fallback: string; label: string; className?: string }) { return <Suspense fallback={<Link href={props.fallback} className={props.className || 'workspace-button'}>← {props.label}</Link>}><Back {...props} /></Suspense>; }
