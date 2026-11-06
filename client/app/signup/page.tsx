'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthForm, AuthScreen } from '@/app/components/AuthScreen';
import { signup } from '@/lib/api';
import { setSession, setWorkspaceId } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await signup({
        name: String(fields.get('name')),
        email: String(fields.get('email')),
        password: String(fields.get('password')),
      });
      const workspaces = res.workspace ? [res.workspace] : (res.workspaces ?? []);
      setSession(res.token, res.user, workspaces);
      if (workspaces[0]) setWorkspaceId(workspaces[0].id);
      router.replace('/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen mode="signup">
      <AuthForm mode="signup" loading={loading} error={error} onSubmit={onSubmit} />
    </AuthScreen>
  );
}
