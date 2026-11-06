'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEventHandler, type ReactNode } from 'react';
import { ArrowRight, BookOpenCheck, Check, CircleAlert, Eye, EyeOff, Loader2, ReceiptText } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { PRODUCT_NAME } from '@/lib/brand';

type AuthMode = 'login' | 'signup';

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700';
const field = 'h-12 w-full rounded-xl border border-slate-500/85 bg-white px-3.5 text-base text-slate-950 placeholder:text-slate-500 focus:border-blue-700 focus:outline-2 focus:outline-blue-700';
const label = 'mb-1.5 block text-sm font-semibold text-slate-800';
const cashLine = 'M3 77 C30 75 49 53 81 58 S134 76 163 46 S213 57 245 33 S292 45 325 18';

function WorkspacePreview() {
  return (
    <figure className="mt-9 rounded-2xl border border-white/15 bg-white p-4 text-slate-950 shadow-2xl shadow-slate-950/25 xl:p-5">
      <figcaption className="flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="text-slate-700">Workspace overview</span>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">Sample data</span>
      </figcaption>
      <p className="mt-4 text-sm text-slate-600">Cash balance</p>
      <p className="mt-0.5 text-[1.75rem] leading-tight font-semibold tracking-tight tabular-nums">$24,680.00</p>
      <svg viewBox="0 0 328 94" className="mt-3 block h-auto w-full" aria-hidden="true">
        <defs>
          <linearGradient id="auth-cash-fill" x2="0" y2="1">
            <stop stopColor="var(--color-blue-200)" />
            <stop offset="1" stopColor="var(--color-blue-50)" />
          </linearGradient>
        </defs>
        <path d="M3 20H325 M3 43H325 M3 66H325 M3 89H325" stroke="var(--color-slate-200)" fill="none" />
        <path d={`${cashLine} V89 H3 Z`} fill="url(#auth-cash-fill)" />
        <path d={cashLine} stroke="var(--color-blue-600)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="325" cy="18" r="4" fill="var(--color-blue-600)" stroke="white" strokeWidth="1.5" />
      </svg>
      <div aria-hidden="true" className="flex justify-between text-xs text-slate-500">
        <span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span>
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-slate-200 pt-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
          <ReceiptText aria-hidden="true" size={17} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Invoice #1042</p>
          <p className="text-xs text-slate-600">Northline Studio</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
          <Check aria-hidden="true" size={13} /> Paid
        </span>
        <p className="text-sm font-semibold tabular-nums">$1,240.00</p>
      </div>
    </figure>
  );
}

export function AuthScreen({ mode, children }: { mode: AuthMode; children: ReactNode }) {
  const signup = mode === 'signup';

  return (
    <div className="grid min-h-dvh bg-slate-50 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-4 lg:p-4">
      <aside className="relative hidden flex-col overflow-hidden rounded-3xl bg-slate-950 px-8 py-9 text-white lg:flex xl:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_16%_85%,var(--color-blue-900),transparent_68%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-size-[42px_42px] [mask-image:linear-gradient(to_top,black,transparent_75%)]" />
        <div className="relative mx-auto flex w-full max-w-115 flex-1 flex-col">
          <Link href="/" className="inline-flex min-h-11 items-center gap-3 self-start rounded-lg text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-200">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-600">
              <BookOpenCheck aria-hidden="true" size={20} />
            </span>
            {PRODUCT_NAME}
          </Link>
          <div className="my-auto pb-2 pt-10 xl:pt-12">
            <p className="text-xs font-semibold tracking-[0.18em] text-blue-200 uppercase">Your bookkeeping workspace</p>
            <p className="mt-4 text-[clamp(2.6rem,4vw,4rem)] leading-[1.02] font-semibold tracking-[-0.055em]">
              A clearer view<br /> <span className="text-blue-200">of your books.</span>
            </p>
            <p className="mt-4 max-w-[35ch] text-base leading-7 text-slate-200">
              Track invoices, reconcile transactions, and see where your business stands in one workspace.
            </p>
            <WorkspacePreview />
          </div>
        </div>
      </aside>

      <section aria-labelledby="auth-heading" className="flex min-w-0 flex-col items-center justify-center px-5 py-8 sm:px-10 sm:py-12">
        <div className="w-full max-w-100">
          <Link href="/" className={`mb-8 inline-flex min-h-11 items-center gap-2.5 rounded-lg text-lg font-semibold tracking-tight lg:hidden ${focus}`}>
            <span className="grid size-10 place-items-center rounded-xl bg-blue-700 text-white">
              <BookOpenCheck aria-hidden="true" size={20} />
            </span>
            {PRODUCT_NAME}
          </Link>
          <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-blue-800 uppercase">
            {signup ? 'Get started' : 'Sign in'}
          </p>
          <h1 id="auth-heading" className="text-4xl leading-tight font-semibold tracking-tight text-slate-950 sm:text-[2.75rem]">
            {signup ? 'Create an account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-base leading-6 text-slate-600">
            {signup ? 'Set up a workspace to start keeping your books.' : 'Sign in to pick up where you left off.'}
          </p>
          <div className="mt-7">{children}</div>
        </div>
      </section>
    </div>
  );
}

export function AuthForm({ mode, loading, error, onSubmit }: {
  mode: AuthMode;
  loading: boolean;
  error: string | null;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  const signup = mode === 'signup';
  const pendingLabel = signup ? 'Creating your account…' : 'Signing in…';
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        {signup && (
          <div>
            <label className={label} htmlFor="auth-name">Full name</label>
            <input className={field} id="auth-name" name="name" autoComplete="name" placeholder="Alex Morgan" required />
          </div>
        )}
        <div>
          <label className={label} htmlFor="auth-email">Email address</label>
          <input className={field} id="auth-email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required />
        </div>
        <div>
          <label className={label} htmlFor="auth-password">Password</label>
          <div className="relative">
            <input
              className={`${field} pr-14`}
              id="auth-password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              minLength={signup ? 8 : undefined}
              aria-describedby={signup ? 'auth-password-hint' : undefined}
              required
            />
            <button
              type="button"
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              aria-controls="auth-password"
              onClick={() => setPasswordVisible(!passwordVisible)}
              className="absolute inset-y-0.5 right-0.5 grid min-w-11 cursor-pointer place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-700"
            >
              {passwordVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
            </button>
          </div>
          {signup && <p id="auth-password-hint" className="mt-1.5 text-sm text-slate-600">Use at least 8 characters.</p>}
        </div>
        {error && (
          <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className={`flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 active:bg-blue-900 disabled:cursor-wait disabled:bg-blue-800 motion-reduce:transition-none ${focus}`}
        >
          {loading ? (
            <>
              <Loader2 aria-hidden="true" className="motion-safe:animate-spin" size={17} />
              {pendingLabel}
            </>
          ) : (
            <>
              {signup ? 'Create account' : 'Sign in'}
              <ArrowRight aria-hidden="true" size={17} />
            </>
          )}
        </button>
      </form>
      <p role="status" className="sr-only">{loading ? pendingLabel : ''}</p>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-600 before:h-px before:flex-1 before:bg-slate-300 after:h-px after:flex-1 after:bg-slate-300">
        or
      </div>
      <a
        href={`${API_BASE_URL}/api/auth/google/start`}
        className={`flex min-h-12 items-center justify-center gap-2.5 rounded-xl border border-slate-500 bg-white px-3 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-50 active:bg-slate-100 motion-reduce:transition-none ${focus}`}
      >
        <Image src="/google-g.png" width={20} height={20} alt="" className="size-5 object-contain" unoptimized />
        {signup ? 'Sign up with Google' : 'Continue with Google'}
      </a>
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-1.5 text-center text-sm text-slate-600">
        {signup ? 'Already have an account?' : 'New to Accountrix?'}
        <Link href={signup ? '/login' : '/signup'} className={`inline-flex min-h-11 items-center rounded-sm font-semibold text-blue-800 underline-offset-4 hover:underline ${focus}`}>
          {signup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </>
  );
}
