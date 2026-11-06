'use client';

import { useEffect, useState } from 'react';

export function useWorkspaceData<T>(load: () => Promise<T>) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{ load: () => Promise<T>; data: T | null; error: boolean } | null>(null);
  const currentResult = result?.load === load ? result : null;

  useEffect(() => {
    let current = true;
    load().then(data => {
      if (current) setResult({ load, data, error: false });
    }).catch(() => {
      if (current) setResult({ load, data: null, error: true });
    });
    return () => { current = false; };
  }, [load, request]);

  return {
    data: currentResult?.data ?? null,
    loading: currentResult === null,
    error: currentResult?.error ?? false,
    retry() {
      setResult(null);
      setRequest(value => value + 1);
    },
  };
}
