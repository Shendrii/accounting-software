'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { decimalText, decimalUnits } from '@/lib/money';
import { useRouter, useSearchParams } from 'next/navigation';
import { WorkspaceHeading, WorkspaceMetric, WorkspacePanel } from '@/app/components/WorkspaceUI';
import { ChartColumn, Loader2, Download, ReceiptText, RefreshCw, TrendingUp } from 'lucide-react';
import {
  getProfitLoss, getBalanceSheet, getTrialBalance,
  type ProfitLossReport, type BalanceSheetReport, type TrialBalanceReport,
} from '@/lib/api';

type Tab = 'pl' | 'bs' | 'tb';

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Shared filter bar ────────────────────────────────────────────────────────

function DateRangeFilter({
  startDate, endDate, loading,
  onStartChange, onEndChange,
}: {
  startDate: string;
  endDate: string;
  loading: boolean;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}) {
  const presets = [
    { label: 'Last 30 days', start: daysAgo(30), end: today() },
    { label: 'Last 90 days', start: daysAgo(90), end: today() },
    { label: 'This year', start: `${new Date().getFullYear()}-01-01`, end: today() },
    { label: 'Last year', start: `${new Date().getFullYear() - 1}-01-01`, end: `${new Date().getFullYear() - 1}-12-31` },
  ];

  return (
    <div className="flex flex-wrap items-end gap-3 mb-6 pb-5 border-b border-zinc-100 dark:border-zinc-800">
      {/* Preset chips */}
      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
        {presets.map((p) => {
          const active = startDate === p.start && endDate === p.end;
          return (
            <button
              key={p.label}
              onClick={() => { onStartChange(p.start); onEndChange(p.end); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active
                  ? 'bg-blue-700 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom date pickers */}
      <div className="grid w-full min-w-0 grid-cols-2 items-end gap-2 sm:ml-auto sm:w-auto">
        <div>
          <label className="mb-1 block text-xs text-slate-600" htmlFor="report-start-date">From</label>
          <input
            type="date"
            id="report-start-date"
            value={startDate}
            onChange={(e) => onStartChange(e.target.value)}
            className="workspace-field min-w-0"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600" htmlFor="report-end-date">To</label>
          <input
            type="date"
            id="report-end-date"
            value={endDate}
            onChange={(e) => onEndChange(e.target.value)}
            className="workspace-field min-w-0"
          />
        </div>
        {loading && <Loader2 className="col-span-2 size-4 text-slate-500 motion-safe:animate-spin" aria-label="Loading report" />}
      </div>
    </div>
  );
}

// ─── Profit & Loss ───────────────────────────────────────────────────────────

function StatementLines({ label, lines, total }: {
  label: string;
  lines: { accountId: string; accountName: string; balance: string }[];
  total: string;
}) {
  return (
    <WorkspacePanel title={label}>
      {lines.length ? <dl className="divide-y divide-slate-100">
        {lines.map(line => <div key={line.accountId} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
          <dt>{line.accountName}</dt><dd className="font-medium whitespace-nowrap tabular-nums">{formatCurrency(line.balance)}</dd>
        </div>)}
      </dl> : <p className="px-4 py-3 text-sm text-slate-600">No activity in this period.</p>}
      <div className="flex justify-between gap-3 rounded-b-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-950">
        <span>Total {label.toLowerCase()}</span><span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </WorkspacePanel>
  );
}

function ProfitLossTab() {
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate, setEndDate] = useState(today());
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getProfitLoss({ startDate, endDate }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!report) return;
    const rows: string[][] = [['Section', 'Account', 'Balance']];
    report.revenue.forEach((r) => rows.push(['Revenue', r.accountName, r.balance]));
    rows.push(['Revenue Total', '', report.totalRevenue]);
    report.expenses.forEach((e) => rows.push(['Expense', e.accountName, e.balance]));
    rows.push(['Expense Total', '', report.totalExpenses]);
    rows.push(['Net Income', '', report.netIncome]);
    downloadCsv(rows, `profit-loss-${startDate}-${endDate}.csv`);
  }

  return (
    <div>
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        loading={loading}
        onStartChange={setStartDate}
        onEndChange={setEndDate}
      />

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="flex items-center gap-1 text-xs underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {loading && !report && (
        <div className="flex items-center justify-center py-20 gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {report && (
        <>
          <div className="flex justify-end mb-3">
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
          <div className="space-y-4" aria-busy={loading}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <WorkspaceMetric label="Revenue" value={formatCurrency(report.totalRevenue)} detail="Posted revenue" icon={TrendingUp} />
              <WorkspaceMetric label="Expenses" value={formatCurrency(report.totalExpenses)} detail="Posted expenses" icon={ReceiptText} />
              <WorkspaceMetric label="Net income" value={formatCurrency(report.netIncome)} detail="Revenue less expenses" icon={ChartColumn} />
            </div>
            <div className="grid items-start gap-4 md:grid-cols-2">
              <StatementLines label="Revenue" lines={report.revenue} total={report.totalRevenue} />
              <StatementLines label="Expenses" lines={report.expenses} total={report.totalExpenses} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

function BalanceSheetTab() {
  const [asOf, setAsOf] = useState(today());
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getBalanceSheet({ asOf }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => { load(); }, [load]);


  return (
    <div>
      {/* Filter */}
      <div className="flex flex-wrap items-end gap-3 mb-6 pb-5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">As of Date</label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400 mb-2.5" />}
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Today', value: today() },
            { label: 'End of last month', value: (() => { const d = new Date(); d.setDate(0); return d.toISOString().split('T')[0]; })() },
            { label: 'End of last year', value: `${new Date().getFullYear() - 1}-12-31` },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => setAsOf(p.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                asOf === p.value
                  ? 'bg-blue-700 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="flex items-center gap-1 text-xs underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {loading && !report && (
        <div className="flex items-center justify-center py-20 gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {report && (
        <div className="space-y-4" aria-busy={loading}>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <StatementLines label="Assets" lines={report.assets} total={report.totalAssets} />
            <div className="space-y-4">
              <StatementLines label="Liabilities" lines={report.liabilities} total={report.totalLiabilities} />
              <StatementLines label="Equity" lines={report.equity} total={report.totalEquity} />
              <div className="flex justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-950">
                <span>Liabilities + equity</span>
                <span className="tabular-nums">{formatCurrency(decimalText(decimalUnits(report.totalLiabilities) + decimalUnits(report.totalEquity)))}</span>
              </div>
            </div>
          </div>
          <p className={`border-t border-zinc-200 px-4 py-3 text-sm ${Number(report.difference) === 0 ? 'text-zinc-600' : 'font-medium text-red-800'}`}>
            Accounting equation difference · {formatCurrency(report.difference)}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

function TrialBalanceTab() {
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate, setEndDate] = useState(today());
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getTrialBalance({ startDate, endDate }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!report) return;
    const rows: string[][] = [['Code', 'Account', 'Type', 'Debit', 'Credit']];
    report.rows.forEach((r) => rows.push([r.accountCode, r.accountName, r.accountType, r.debitTotal, r.creditTotal]));
    rows.push(['TOTALS', '', '', report.totals.debitTotal, report.totals.creditTotal]);
    downloadCsv(rows, `trial-balance-${startDate}-${endDate}.csv`);
  }

  return (
    <div>
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        loading={loading}
        onStartChange={setStartDate}
        onEndChange={setEndDate}
      />

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="flex items-center gap-1 text-xs underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {loading && !report && (
        <div className="flex items-center justify-center py-20 gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {report && (
        <>
          <div className="flex justify-end mb-3">
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
          <div className={`workspace-panel workspace-table-wrap transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {['Code', 'Account', 'Type', 'Debit', 'Credit'].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider ${
                        h === 'Debit' || h === 'Credit' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                      No activity in this period.
                    </td>
                  </tr>
                ) : (
                  report.rows.map((row) => (
                    <tr key={row.accountId} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{row.accountCode}</td>
                      <td className="px-4 py-2.5 text-zinc-800 dark:text-zinc-200">{row.accountName}</td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs">{row.accountType}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(row.debitTotal)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(row.creditTotal)}</td>
                    </tr>
                  ))
                )}
                <tr className="bg-zinc-50 dark:bg-zinc-800/50 font-bold">
                  <td className="px-4 py-3" colSpan={3}>Totals</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(report.totals.debitTotal)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(report.totals.creditTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const activeTab: Tab = requested === 'trial-balance' ? 'tb' : requested === 'balance-sheet' ? 'bs' : 'pl';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pl', label: 'Profit & Loss' },
    { id: 'bs', label: 'Balance Sheet' },
    { id: 'tb', label: 'Trial Balance' },
  ];

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5 space-y-4">
          <WorkspaceHeading section="Books and reporting" title="Reports" description="Inspect statements and their posted balances." />
          <nav aria-label="Financial statements" className="workspace-tabs">
            {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} className="workspace-tab"
              onClick={() => router.push(tab.id === 'pl' ? '/reports' : '/reports?tab=' + (tab.id === 'bs' ? 'balance-sheet' : 'trial-balance'), { scroll: false })}>
              {tab.label}
            </button>)}
          </nav>
          <p className="text-sm text-slate-600">
            Review variances in <Link href="/purchases" className="font-semibold text-blue-800 hover:underline">Purchases</Link>, collections in <Link href="/sales" className="font-semibold text-blue-800 hover:underline">Sales</Link>, and posting in <Link href="/ledger" className="font-semibold text-blue-800 hover:underline">Ledger and close</Link>.
          </p>
        </div>

        {activeTab === 'pl' && <ProfitLossTab />}
        {activeTab === 'bs' && <BalanceSheetTab />}
        {activeTab === 'tb' && <TrialBalanceTab />}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={<div className="workspace-page"><p className="workspace-content text-sm text-slate-600" role="status">Loading reports…</p></div>}>
    <ReportsContent />
  </Suspense>;
}
