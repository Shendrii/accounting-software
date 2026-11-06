'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Loader2, Repeat } from 'lucide-react';
import { getBills, getRecurringBills, triggerRecurring, type Bill, type BillStatus } from '@/lib/api';
import { toast } from '@/lib/toast';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';

import { WorkflowTabs, WorkspaceHeading, WorkspaceNotice } from '@/app/components/WorkspaceUI';

const STATUS_COLORS: Record<BillStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  RECEIVED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  PAID: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  VOID: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const INTERVAL_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [recurringBills, setRecurringBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BillStatus | ''>('');
  const [tab, setTab] = useState<'all' | 'recurring'>('all');
  const [runningRecurring, setRunningRecurring] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, recurring] = await Promise.all([
        getBills(statusFilter ? { status: statusFilter } : undefined),
        getRecurringBills(),
      ]);
      setBills(data);
      setRecurringBills(recurring);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  }

  async function handleRunRecurring() {
    setRunningRecurring(true);
    try {
      const result = await triggerRecurring();
      if (result.created > 0) {
        toast.success(`Created ${result.created} new recurring bill${result.created !== 1 ? 's' : ''}`);
        load();
      } else {
        toast.success('No recurring transactions are due yet');
      }
    } catch {
      toast.success('Failed to run recurring transactions');
    } finally {
      setRunningRecurring(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = bills.filter(
    (b) =>
      b.billNo.toLowerCase().includes(search.toLowerCase()) ||
      (b.vendor?.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5 space-y-4">
          <WorkspaceHeading section="Purchases" title="Bills" description="Review due dates, payment status, and recurring bills."
            actions={<Link href="/purchases/bills/new" className="workspace-primary"><Plus className="size-4" aria-hidden="true" />New bill</Link>} />
          <WorkflowTabs area="purchases" active="bills" />
        </div>

        {loadError && (
          <div className="mb-5"><WorkspaceNotice title="Bills could not load" onRetry={load}>{loadError}</WorkspaceNotice></div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'all' ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            All Bills
          </button>
          <button
            onClick={() => setTab('recurring')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'recurring' ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            <Repeat className="h-3.5 w-3.5" />
            Recurring
            {recurringBills.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium dark:bg-blue-900/40 dark:text-blue-400">
                {recurringBills.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'all' && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by bill # or vendor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BillStatus | '')}
            className="px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            {(['DRAFT', 'RECEIVED', 'PAID', 'VOID'] as BillStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        )}

        {tab === 'all' && (
        <div className="workspace-panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 dark:text-zinc-400">
              No bills found.{' '}
              <Link href="/purchases/bills/new" className="text-zinc-700 dark:text-zinc-300 underline">
                Create one
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {['Bill #', 'Vendor', 'Date', 'Due Date', 'Total', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((bill) => (
                  <tr
                    key={bill.id}
                    className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                      {bill.billNo}
                      {bill.isRecurring && (
                        <span title="Recurring" aria-label="Recurring">
                          <Repeat className="h-3.5 w-3.5 text-blue-500" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bill.vendor?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(bill.date)}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(bill.dueDate)}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{formatCurrency(bill.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[bill.status]}`}>
                        {bill.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/purchases/bills/${bill.id}`}
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
        )}

        {tab === 'recurring' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Recurring templates auto-create new draft bills when their next due date arrives.
              </p>
              <button
                onClick={handleRunRecurring}
                disabled={runningRecurring}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {runningRecurring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                Run Now
              </button>
            </div>
            <div className="workspace-panel overflow-hidden">
              {recurringBills.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 dark:text-zinc-400">
                  No recurring bills yet.{' '}
                  <Link href="/purchases/bills/new" className="text-zinc-700 dark:text-zinc-300 underline">
                    Create a bill
                  </Link>{' '}
                  and check &ldquo;Make this recurring&rdquo;.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      {['Bill #', 'Vendor', 'Frequency', 'Next Due', 'Total', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recurringBills.map((bill) => (
                      <tr key={bill.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{bill.billNo}</td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bill.vendor?.name ?? '-'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            <Repeat className="h-3 w-3" />
                            {INTERVAL_LABELS[bill.recurrenceInterval ?? 'monthly'] ?? bill.recurrenceInterval}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {bill.nextDueDate ? formatDate(bill.nextDueDate) : '-'}
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{formatCurrency(bill.total)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/purchases/bills/${bill.id}`} className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50">
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
        )}
      </div>
    </div>
  );
}

export default function LegacyBillsPage() {
  return <LegacyRedirect to="/purchases/bills" />;
}
