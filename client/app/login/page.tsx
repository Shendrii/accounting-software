'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthForm, AuthScreen } from '@/app/components/AuthScreen';
import { login } from '@/lib/api';
import { setSession, setWorkspaceId } from '@/lib/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await login({
        email: String(fields.get('email')),
        password: String(fields.get('password')),
      });
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

  return <AuthForm mode="login" loading={loading} error={error} onSubmit={onSubmit} />;
}

export default function LoginPage() {
  return (
    <AuthScreen mode="login">
      <Suspense fallback={<p role="status" className="min-h-90 text-sm text-slate-600">Loading sign-in form…</p>}>
        <LoginForm />
      </Suspense>
    </AuthScreen>
  );
}
