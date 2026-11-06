import Link from 'next/link';
import { ArrowRight, BookOpenCheck, Inbox, Landmark, ShieldCheck } from 'lucide-react';
import { PRODUCT_NAME } from '@/lib/brand';

export function MarketingLanding() {
  return (
    <div className="min-h-dvh bg-[#f3f6fc] text-slate-950">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"><span className="workspace-brand-mark"><BookOpenCheck className="size-5" aria-hidden="true" /></span>{PRODUCT_NAME}</Link>
        <div className="flex gap-2">
          <Link href="/login" className="workspace-button">
            Sign in
          </Link>
          <Link href="/signup" className="workspace-primary hidden sm:inline-flex">
            Create workspace
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-8 rounded-none bg-[#101b34] bg-linear-to-br from-[#101b34] to-blue-950 px-5 py-10 text-white sm:px-8 lg:grid-cols-2 lg:gap-14 lg:rounded-3xl lg:p-14">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-blue-200 uppercase">Your bookkeeping workspace</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">A clearer view <span className="text-blue-200">of your books.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-blue-100">
            Track invoices, reconcile transactions, and see where your business stands in one workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="workspace-primary min-h-12 px-5">
              Start a workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="workspace-button min-h-12 px-5">
              Sign in
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 sm:p-6">
          <p className="workspace-eyebrow">Sample workspace</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">Northline Studio</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              ['Cash', '$84,210'],
              ['AR open', '$13,824'],
              ['AP due', '$4,180'],
              ['To review', '3 items'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-600">{label}</p>
                <p className="mt-2 text-lg font-semibold tabular-nums sm:text-xl">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 border-y border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-2xl font-bold">How {PRODUCT_NAME} works</h2>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              ['1', 'Inbox first', 'Receipts and quick entries land in one review queue.'],
              ['2', 'Sales and purchases', 'Customers, invoices, vendors, and bills stay together with aging on top.'],
              ['3', 'Close with confidence', 'Unposted entries, unmatched bank lines, and overdue AR/AP in one checklist.'],
            ].map(([number, title, copy]) => (
              <div key={number} className="rounded-2xl bg-zinc-50 p-5">
                <span className="font-bold text-blue-700">{number}</span>
                <p className="mt-4 font-bold">{title}</p>
                <p className="mt-2 text-sm text-zinc-600">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-14 md:grid-cols-2">
        <div className="flex gap-4 rounded-2xl bg-blue-50 p-6">
          <Inbox className="h-7 w-7 shrink-0 text-blue-700" />
          <div>
            <h2 className="font-bold">Built for daily bookkeeping</h2>
            <p className="mt-1 text-sm text-zinc-600">OCR review, bank matching, and AR/AP live in the same sidebar a bookkeeper already uses.</p>
          </div>
        </div>
        <div className="flex gap-4 rounded-2xl bg-blue-50 p-6">
          <BookOpenCheck className="h-7 w-7 shrink-0 text-blue-700" />
          <div>
            <h2 className="font-bold">Ready for period close</h2>
            <p className="mt-1 text-sm text-zinc-600">Controllers get a close checklist and read-only reports that link back to the source tab.</p>
          </div>
        </div>
        <div className="flex gap-4 rounded-2xl bg-blue-50 p-6">
          <Landmark className="h-7 w-7 shrink-0 text-blue-700" />
          <div>
            <h2 className="font-bold">Bank matches, not blank search</h2>
            <p className="mt-1 text-sm text-zinc-600">Suggested links from amount, date, and vendor — confirm in one click.</p>
          </div>
        </div>
        <div className="flex gap-4 rounded-2xl bg-blue-50 p-6">
          <ShieldCheck className="h-7 w-7 shrink-0 text-blue-700" />
          <div>
            <h2 className="font-bold">Workspace-scoped by default</h2>
            <p className="mt-1 text-sm text-zinc-600">Every query stays inside the current workspace. Invite your team when you are ready.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
