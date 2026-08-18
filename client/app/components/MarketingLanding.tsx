import Link from 'next/link';
import { ArrowRight, BookOpenCheck, Inbox, Landmark, ShieldCheck } from 'lucide-react';

export function MarketingLanding() {
  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-950" style={{ colorScheme: 'light' }}>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <p className="text-xl font-bold tracking-tight">
          Ledger<span className="text-blue-600">.</span>
        </p>
        <div className="flex gap-2">
          <Link href="/login" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">
            Sign in
          </Link>
          <Link href="/signup" className="inline-flex h-11 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
            Create workspace
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-10 lg:grid-cols-2 lg:items-center lg:py-20">
        <div>
          <p className="font-semibold text-blue-700">Bookkeeping that follows how accountants actually work</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">Daily books. Period close. No extra tabs.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600">
            Capture receipts, collect invoices, match the bank, and close the month from one workspace — scoped to your team, not a flat page list.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700">
              Start a workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-800 hover:bg-zinc-50">
              Sign in
            </Link>
          </div>
        </div>
        <div className="rounded-[2rem] bg-zinc-950 p-7 text-white shadow-2xl">
          <p className="text-blue-300">This week at Northline Studio</p>
          <p className="mt-3 text-3xl font-bold">Four numbers that need attention.</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              ['Cash', '$84,210'],
              ['AR open', '$13,824'],
              ['AP due', '$4,180'],
              ['To review', '3 items'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-zinc-400">{label}</p>
                <p className="mt-3 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white py-14">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-2xl font-bold">How Ledger works</h2>
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
    </main>
  );
}
