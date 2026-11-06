'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Loader2 } from 'lucide-react';
import { getInvoices, type Invoice, type InvoiceStatus } from '@/lib/api';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';

import { WorkflowTabs, WorkspaceHeading, WorkspaceNotice } from '@/app/components/WorkspaceUI';

import { invoiceStatus, WorkspaceStatus } from '@/app/components/WorkspaceActivity';

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function InvoicesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialStatus = (searchParams.get('status') as InvoiceStatus | null) ?? '';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>(initialStatus);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getInvoices(statusFilter ? { status: statusFilter } : undefined);
      setInvoices(data);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Sync URL param
    const params = new URLSearchParams(searchParams.toString());
    if (statusFilter) {
      params.set('status', statusFilter);
    } else {
      params.delete('status');
    }
    const query = params.toString();
    if (query !== searchParams.toString()) {
      router.replace(`/sales/invoices${query ? '?' + query : ''}`, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = invoices.filter(
    (inv) =>
      inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customer?.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5 space-y-4">
          <WorkspaceHeading section="Sales" title="Invoices" description="Track drafts, posted invoices, and their balances."
            actions={<Link href="/sales/invoices/new" className="workspace-primary"><Plus className="size-4" aria-hidden="true" />New invoice</Link>} />
          <WorkflowTabs area="sales" active="invoices" />
        </div>

        {loadError && (
          <div className="mb-5"><WorkspaceNotice title="Invoices could not load" onRetry={load}>{loadError}</WorkspaceNotice></div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by invoice # or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | '')}
            className="px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            {(['DRAFT', 'SENT', 'PAID', 'VOID'] as InvoiceStatus[]).map((s) => (
              <option key={s} value={s}>{s === 'SENT' ? 'Open' : s}</option>
            ))}
          </select>
        </div>

        <div className="workspace-panel overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 dark:text-zinc-400">
              No invoices found.{' '}
              <Link href="/sales/invoices/new" className="text-zinc-700 dark:text-zinc-300 underline">
                Create one
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {['Invoice #', 'Customer', 'Date', 'Due Date', 'Total', 'Balance due', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{inv.invoiceNo}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{inv.customer?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(inv.date)}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{formatCurrency(inv.total)}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900 tabular-nums">{inv.status === 'DRAFT' || inv.status === 'VOID' ? '—' : formatCurrency(inv.balanceDue)}</td>
                    <td className="px-4 py-3">
                      <WorkspaceStatus>{invoiceStatus(inv)}</WorkspaceStatus>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/sales/invoices/${inv.id}`}
                        className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function InvoicesPage() {
  return (
    <Suspense fallback={
      <div className="workspace-page grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    }>
      <InvoicesContent />
    </Suspense>
  );
}

export default function LegacyInvoicesPage() {
  return <LegacyRedirect to="/sales/invoices" />;
}
