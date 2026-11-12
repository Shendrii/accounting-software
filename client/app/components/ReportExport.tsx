'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { API_BASE_URL, apiFetch } from '@/lib/api';

export default function ReportExport({ report, params = {}, label, formats = ['csv', 'pdf'] }: {
  report: string; params?: Record<string, string>; label?: string; formats?: Array<'csv' | 'pdf'>;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function download(format: 'csv' | 'pdf') {
    if (busy) return;
    setBusy(format); setError('');
    try {
      const response = await apiFetch(API_BASE_URL + '/api/reports/export?' + new URLSearchParams({ ...params, report, format }), { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error || 'The complete report could not export.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'accountrix-' + report + '-' + (params.asOf || params.endDate || new Date().toISOString().slice(0, 10)) + '.' + format;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The report could not export. Retry the download.'); }
    finally { setBusy(''); }
  }
  return <div className="grid gap-2">
    <div className="flex flex-wrap gap-2" role="group" aria-label={label || 'Complete report exports'} aria-busy={Boolean(busy)}>
      {formats.map(format => <button type="button" key={format} className="workspace-button" disabled={Boolean(busy)} onClick={() => void download(format)}><Download className="size-4" aria-hidden="true" />{busy === format ? 'Preparing complete report…' : (label ? label + ' · ' : '') + format.toUpperCase()}</button>)}
    </div>
    {error && <p role="alert" className="max-w-lg text-sm text-rose-800">{error}</p>}
  </div>;
}
