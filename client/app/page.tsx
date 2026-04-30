'use client';

import Link from 'next/link';
import { BookOpen, TrendingUp, TrendingDown, DollarSign, FileText, BarChart3, Users, Building2, Receipt, RefreshCw, AlertTriangle, Info, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchDashboard, getInsights, type DashboardData, type InsightAlert } from '@/lib/api';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  loading: boolean;
  highlight?: 'green' | 'red' | 'blue' | 'default';
}) {
  const colorMap = {
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400',
    default: 'text-zinc-900 dark:text-zinc-50',
  };
  const valueColor = colorMap[highlight ?? 'default'];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</h3>
        <Icon className="h-5 w-5 text-zinc-400" />
      </div>
      {loading ? (
        <div className="h-8 w-28 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
      ) : (
        <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
      )}
    </div>
  );
}

function AlertBadge({ severity }: { severity: InsightAlert['severity'] }) {
  if (severity === 'critical') return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  return <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />;
}

const severityBorder: Record<InsightAlert['severity'], string> = {
  critical: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
  info: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
};

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<InsightAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    getInsights()
      .then((d) => setAlerts(d.alerts))
      .catch(() => {});
  }, []);

  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.type));
  const dismissAlert = (type: string) => setDismissedAlerts((prev) => new Set([...prev, type]));

  const netIncome = data ? parseFloat(data.netIncome) : 0;

  return (
    <div className="lg:pl-64 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Financial Overview
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Your business at a glance.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            Could not load dashboard data: {error}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <KpiCard
            label="Cash Balance"
            value={data ? formatCurrency(data.cashBalance) : '$0.00'}
            icon={DollarSign}
            loading={loading}
            highlight="blue"
          />
          <KpiCard
            label="Total Income"
            value={data ? formatCurrency(data.totalIncome) : '$0.00'}
            icon={TrendingUp}
            loading={loading}
            highlight="green"
          />
          <KpiCard
            label="Total Expenses"
            value={data ? formatCurrency(data.totalExpenses) : '$0.00'}
            icon={TrendingDown}
            loading={loading}
            highlight="red"
          />
          <KpiCard
            label="Net Income"
            value={data ? formatCurrency(data.netIncome) : '$0.00'}
            icon={BarChart3}
            loading={loading}
            highlight={netIncome >= 0 ? 'green' : 'red'}
          />
        </div>

        {/* Outstanding Invoices Banner */}
        {!loading && data && parseInt(String(data.outstandingInvoicesCount)) > 0 && (
          <div className="mb-10 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {data.outstandingInvoicesCount} outstanding invoice{data.outstandingInvoicesCount !== 1 ? 's' : ''} totalling{' '}
                {formatCurrency(data.outstandingInvoicesTotal)}
              </span>
            </div>
            <Link
              href="/invoices?status=SENT"
              className="text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
            >
              View invoices →
            </Link>
          </div>
        )}

        {/* Smart Alerts */}
        {visibleAlerts.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">Smart Alerts</h2>
            <div className="space-y-3">
              {visibleAlerts.map((alert) => (
                <div key={alert.type} className={`flex items-start gap-3 p-4 rounded-lg border ${severityBorder[alert.severity]}`}>
                  <AlertBadge severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{alert.message}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{alert.detail}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Link href={alert.link} className="text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:underline whitespace-nowrap">
                      View →
                    </Link>
                    <button
                      onClick={() => dismissAlert(alert.type)}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      aria-label="Dismiss"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { href: '/bookkeeping', icon: BookOpen, label: 'Bookkeeping', desc: 'Manage accounts and journal entries.' },
            { href: '/invoices', icon: FileText, label: 'Invoices', desc: 'Create and manage customer invoices.' },
            { href: '/bills', icon: FileText, label: 'Bills', desc: 'Track vendor bills and payments.' },
            { href: '/customers', icon: Users, label: 'Customers', desc: 'Manage your customer list.' },
            { href: '/vendors', icon: Building2, label: 'Vendors', desc: 'Manage your vendor list.' },
            { href: '/reports', icon: BarChart3, label: 'Reports', desc: 'P&L, Balance Sheet, Trial Balance.' },
            { href: '/receipts', icon: Receipt, label: 'Receipts', desc: 'Upload and approve expense receipts.' },
            { href: '/reconciliation', icon: RefreshCw, label: 'Reconciliation', desc: 'Match bank transactions to journal entries.' },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 hover:shadow-md"
            >
              <Icon className="h-7 w-7 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors mb-3" />
              <p className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">{label}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
