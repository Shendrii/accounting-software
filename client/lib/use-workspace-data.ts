'use client';

import { useEffect, useState } from 'react';

export function useWorkspaceData<T>(load: () => Promise<T>) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{ data: T | null; error: boolean } | null>(null);

  useEffect(() => {
    let current = true;
    load().then(data => {
      if (current) setResult({ data, error: false });
    }).catch(() => {
      if (current) setResult({ data: null, error: true });
    });
    return () => { current = false; };
  }, [load, request]);

  return {
    data: result?.data ?? null,
    loading: result === null,
    error: result?.error ?? false,
    retry() {
      setResult(null);
      setRequest(value => value + 1);
    },
  };
}
