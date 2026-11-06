'use client';

import { ImageOff, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { attachReceiptImage, fetchReceiptImage } from '@/lib/api';

type Preview = { status: 'loading' | 'missing' | 'failed' } | { status: 'ready'; url: string };

export default function ReceiptImage({ receiptId }: { receiptId: string }) {
  const [preview, setPreview] = useState<Preview>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    let url: string | undefined;
    fetchReceiptImage(receiptId, abort.signal).then(blob => {
      if (abort.signal.aborted) return;
      if (blob) {
        url = URL.createObjectURL(blob);
        setPreview({ status: 'ready', url });
      } else {
        setPreview({ status: 'missing' });
      }
    }).catch(() => {
      if (!abort.signal.aborted) setPreview({ status: 'failed' });
    });
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [receiptId, revision]);

  function reload() {
    setPreview({ status: 'loading' });
    setRevision(value => value + 1);
  }

  async function attach(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || attaching) return;
    setAttaching(true);
    setError('');
    try {
      await attachReceiptImage(receiptId, file);
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not attach receipt image.');
    } finally {
      setAttaching(false);
    }
  }

  return <div className="grid min-h-40 shrink-0 place-items-center bg-slate-100 p-4 md:w-[32%]">
    {preview.status === 'ready' ?
      <a href={preview.url} target="_blank" rel="noopener noreferrer" aria-label="Open receipt image in a new tab" className="block w-full rounded-lg">
        {/* The image is an authenticated local blob. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview.url} alt="Receipt" className="mx-auto max-h-80 w-full rounded-lg object-contain" onError={() => setPreview({ status: 'failed' })} />
      </a> : preview.status === 'loading' ? <p role="status" className="text-sm text-slate-600">Loading image…</p> :
      <div className="max-w-56 space-y-2 text-center">
        <ImageOff className="mx-auto size-6 text-slate-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-900">{preview.status === 'missing' ? 'Receipt image unavailable' : 'Receipt image could not load'}</p>
        {preview.status === 'missing' ? <>
          <p className="text-xs text-slate-600">Attach the original image if you have it. The saved details will stay the same.</p>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={attach} />
          <button type="button" className="workspace-button" disabled={attaching} onClick={() => input.current?.click()}>
            <Upload className="size-4" aria-hidden="true" />{attaching ? 'Attaching…' : 'Attach image'}
          </button>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        </> : <button type="button" className="workspace-button" onClick={reload}>Retry image</button>}
      </div>}
  </div>;
}
