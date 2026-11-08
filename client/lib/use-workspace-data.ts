'use client';

import { useEffect, useState } from 'react';

export function useWorkspaceData<T>(load: () => Promise<T>) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{ load: () => Promise<T>; data: T | null; error: boolean;errorMessage?:string } | null>(null);
  const [slowRequest,setSlowRequest]=useState<{load:()=>Promise<T>;request:number}|null>(null);
  const currentResult = result?.load === load ? result : null;

  useEffect(() => {
    let current = true;
    const timer=setTimeout(()=>{if(current)setSlowRequest({load,request});},8000);
    Promise.resolve().then(load).then(data => {
      clearTimeout(timer);
      if (current) setResult({ load, data, error: false });
    }).catch(cause => {
      clearTimeout(timer);
      if (current) setResult({ load, data: null, error: true,errorMessage:cause instanceof Error?cause.message:'The request could not finish.' });
    });
    return () => { current = false;clearTimeout(timer); };
  }, [load, request]);

  return {
    data: currentResult?.data ?? null,
    loading: currentResult === null,
    error: currentResult?.error ?? false,
    errorMessage:currentResult?.errorMessage,
    slow:currentResult===null&&slowRequest?.load===load&&slowRequest?.request===request,
    retry() {
      setResult(null);
      setRequest(value => value + 1);
    },
  };
}
