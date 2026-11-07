'use client';
import { useMemo } from 'react';
import { useWorkspaces } from '@/app/components/WorkspaceProvider';

export function useMoney() {
  const { active } = useWorkspaces();
  const currency = active?.currency ?? 'USD';
  const formatter = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency }), [currency]);
  return { currency, format: (amount: string | number) => formatter.format(Number(amount)) };
}
