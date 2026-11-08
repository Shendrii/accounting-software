import Link from 'next/link';
import { BookOpenCheck, type LucideIcon } from 'lucide-react';
import { PRODUCT_NAME } from '@/lib/brand';

export function AccessStatus({ title, description, icon: Icon, children, pending }: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children?: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
      <section aria-labelledby="access-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-[#fafaf7] p-4 sm:p-5">
          <Link href="/" className="workspace-brand w-fit"><span className="workspace-brand-mark"><BookOpenCheck className="size-5" aria-hidden="true" /></span>{PRODUCT_NAME}</Link>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <span className="workspace-icon size-10"><Icon className={'size-5' + (pending ? ' motion-safe:animate-spin' : '')} aria-hidden="true" /></span>
          <div role={pending ? 'status' : undefined}>
            <h1 id="access-title" className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
            {description && <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>}
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
