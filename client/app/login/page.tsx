'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL, login } from '@/lib/api';
import { setSession, setWorkspaceId } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await login({ email, password });
      const workspaces = res.workspaces ?? (res.workspace ? [res.workspace] : []);
      setSession(res.token, res.user, workspaces);
      if (workspaces[0]) setWorkspaceId(workspaces[0].id);
      router.replace(redirect);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-50 dark:bg-zinc-950">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Sign in</h1>
        <p className="text-sm text-zinc-500">Access your accounting workspace</p>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
        </div>
        <div>
          <label className="block text-sm mb-1">Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
        </div>
        <button disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </button>
        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-zinc-900 px-2 text-zinc-500">Or</span>
          </div>
        </div>
        <a
          href={`${API_BASE_URL}/api/auth/google/start`}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Continue with Google
        </a>
        <p className="text-sm text-zinc-500">
          No account yet? <Link href="/signup" className="text-zinc-900 dark:text-zinc-50 underline">Create one</Link>
        </p>
      </form>
    </div>
  );
}

