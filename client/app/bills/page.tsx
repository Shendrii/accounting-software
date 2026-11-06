'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, Loader2, Repeat } from 'lucide-react';
import { getBills, getRecurringBills, triggerRecurring, type Bill, type BillStatus } from '@/lib/api';
import { toast } from '@/lib/toast';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
import { billStatus, WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { decimalUnits, localDay } from '@/lib/money';

import { WorkflowTabs, WorkspaceHeading, WorkspaceNotice } from '@/app/components/WorkspaceUI';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view') ?? '';
  const requestedStatus = searchParams.get('status') ?? '';
  const statusFilter = (['DRAFT', 'RECEIVED', 'PAID', 'VOID'].includes(requestedStatus) ? requestedStatus : '') as BillStatus | '';
  const filter = ['open', 'overdue', 'due-soon'].includes(view) ? view : statusFilter;
  const apiStatus = ['open', 'overdue', 'due-soon'].includes(filter) ? 'RECEIVED' : statusFilter;
  const [tab, setTab] = useState<'all' | 'recurring'>('all');
  const [runningRecurring, setRunningRecurring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, recurring] = await Promise.all([
        getBills(apiStatus ? { status: apiStatus } : undefined),
        getRecurringBills(),
      ]);
      setBills(data);
      setRecurringBills(recurring);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  }, [apiStatus]);

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

  useEffect(() => { void load(); }, [load]);

  const today = localDay();
  const soon = new Date(today + 'T00:00:00Z');
  soon.setUTCDate(soon.getUTCDate() + 7);
  const through = soon.toISOString().slice(0, 10);
  const filtered = bills.filter(bill => {
    const matchesSearch = bill.billNo.toLowerCase().includes(search.toLowerCase()) ||
      (bill.vendor?.name ?? '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch || (apiStatus && bill.status !== apiStatus)) return false;
    if (['open', 'overdue', 'due-soon'].includes(filter) && (!bill.postingEntryId || decimalUnits(bill.balanceDue ?? '0') <= BigInt(0))) return false;
    const due = bill.dueDate.slice(0, 10);
    if (filter === 'overdue') return due < today;
    if (filter === 'due-soon') return due >= today && due <= through;
    return true;
  });

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
            aria-label="Bill status" value={filter}
            onChange={event => {
              const value = event.target.value;
              const query = ['open', 'overdue', 'due-soon'].includes(value) ? '?view=' + value : value ? '?status=' + value : '';
              router.replace('/purchases/bills' + query, { scroll: false });
            }}
            className="px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            <option value="open">Unpaid bills</option><option value="overdue">Overdue bills</option><option value="due-soon">Due within 7 days</option>
            <option value="DRAFT">Draft</option><option value="PAID">Paid</option><option value="VOID">Void</option>
            {filter === 'RECEIVED' && <option value="RECEIVED">Awaiting payment</option>}
          </select>
        </div>
        )}

        {tab === 'all' && (
        <div className="workspace-panel overflow-x-auto">
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
                  {['Bill #', 'Vendor', 'Date', 'Due Date', 'Open balance', 'Status', ''].map((h) => (
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
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{bill.status === 'DRAFT' || bill.status === 'VOID' ? '—' : formatCurrency(bill.balanceDue ?? (bill.status === 'PAID' ? '0' : bill.total))}</td>
                    <td className="px-4 py-3">
                      <WorkspaceStatus>{billStatus(bill)}</WorkspaceStatus>
                      {bill.status === 'RECEIVED' && bill.dueDate.slice(0, 10) < today && <p className="mt-1 text-xs text-amber-800">Overdue</p>}
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
