'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Download, RefreshCw } from 'lucide-react';
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
                  ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom date pickers */}
      <div className="flex items-end gap-2 ml-auto">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400 mb-2.5" />}
      </div>
    </div>
  );
}

// ─── Profit & Loss ───────────────────────────────────────────────────────────

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
          <div className={`bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
            {/* Revenue */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-3">Revenue</h3>
              {report.revenue.length === 0 ? (
                <p className="text-sm text-zinc-400">No revenue in this period.</p>
              ) : (
                report.revenue.map((r) => (
                  <div key={r.accountId} className="flex justify-between py-1.5 text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">{r.accountName}</span>
                    <span className="font-medium">{formatCurrency(r.balance)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between py-2 mt-1 border-t border-zinc-100 dark:border-zinc-800 font-semibold text-sm">
                <span>Total Revenue</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(report.totalRevenue)}</span>
              </div>
            </div>

            {/* Expenses */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-3">Expenses</h3>
              {report.expenses.length === 0 ? (
                <p className="text-sm text-zinc-400">No expenses in this period.</p>
              ) : (
                report.expenses.map((e) => (
                  <div key={e.accountId} className="flex justify-between py-1.5 text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">{e.accountName}</span>
                    <span className="font-medium">{formatCurrency(e.balance)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between py-2 mt-1 border-t border-zinc-100 dark:border-zinc-800 font-semibold text-sm">
                <span>Total Expenses</span>
                <span className="text-red-600 dark:text-red-400">{formatCurrency(report.totalExpenses)}</span>
              </div>
            </div>

            {/* Net Income */}
            <div className="p-4 flex justify-between items-center">
              <span className="font-bold text-zinc-900 dark:text-zinc-50">Net Income</span>
              <span className={`text-xl font-bold ${parseFloat(report.netIncome) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(report.netIncome)}
              </span>
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

  function Section({ title, items, total, color }: {
    title: string;
    items: { accountId: string; accountName: string; balance: string }[];
    total: string;
    color: string;
  }) {
    return (
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-3">{title}</h3>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">No accounts.</p>
        ) : (
          items.map((item) => (
            <div key={item.accountId} className="flex justify-between py-1.5 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">{item.accountName}</span>
              <span className="font-medium">{formatCurrency(item.balance)}</span>
            </div>
          ))
        )}
        <div className={`flex justify-between py-2 mt-1 border-t border-zinc-100 dark:border-zinc-800 font-semibold text-sm ${color}`}>
          <span>Total {title}</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    );
  }

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
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
                  ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
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
        <div className={`bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
          <Section title="Assets" items={report.assets} total={report.totalAssets} color="text-blue-600 dark:text-blue-400" />
          <Section title="Liabilities" items={report.liabilities} total={report.totalLiabilities} color="text-red-600 dark:text-red-400" />
          <Section title="Equity" items={report.equity} total={report.totalEquity} color="text-emerald-600 dark:text-emerald-400" />
          <div className="p-4 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
            <span className="font-bold text-zinc-900 dark:text-zinc-50">Liabilities + Equity</span>
            <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(parseFloat(report.totalLiabilities) + parseFloat(report.totalEquity))}
            </span>
          </div>
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
          <div className={`bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
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

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('pl');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pl', label: 'Profit & Loss' },
    { id: 'bs', label: 'Balance Sheet' },
    { id: 'tb', label: 'Trial Balance' },
  ];

  return (
    <div className="lg:pl-64 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <BarChart3 className="h-7 w-7 text-zinc-600 dark:text-zinc-400" />
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Reports</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-fit mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'pl' && <ProfitLossTab />}
        {activeTab === 'bs' && <BalanceSheetTab />}
        {activeTab === 'tb' && <TrialBalanceTab />}
      </div>
    </div>
  );
}
