'use client';

import Link from 'next/link';
import { BellDot, DollarSign, ReceiptText, ShoppingCart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchDashboard, getBills, getReceipts, type DashboardData } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { MarketingLanding } from '@/app/components/MarketingLanding';

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
  href,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  loading: boolean;
  highlight?: 'green' | 'red' | 'blue' | 'default';
  href: string;
}) {
  const colorMap = {
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400',
    default: 'text-zinc-900 dark:text-zinc-50',
  };
  const valueColor = colorMap[highlight ?? 'default'];

  return (
    <Link href={href} className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 transition hover:border-zinc-300 hover:shadow-sm dark:hover:border-zinc-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</h3>
        <Icon className="h-5 w-5 text-zinc-400" />
      </div>
      {loading ? (
        <div className="h-8 w-28 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
      ) : (
        <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
      )}
    </Link>
  );
}

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apTotal, setApTotal] = useState(0);
  const [pendingReceipts, setPendingReceipts] = useState(0);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    getBills({ status: 'RECEIVED' }).then((bills) => setApTotal(bills.reduce((sum, bill) => sum + Number(bill.total), 0))).catch(() => {});
    getReceipts('PENDING').then((receipts) => setPendingReceipts(receipts.length)).catch(() => {});
  }, []);

  return (
    <div className="lg:pl-64 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Accounting overview
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            The four numbers that need attention today.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            Could not load dashboard data: {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard
            label="Cash position"
            value={data ? formatCurrency(data.cashBalance) : '$0.00'}
            icon={DollarSign}
            loading={loading}
            highlight="blue"
            href="/banking"
          />
          <KpiCard
            label="AR outstanding"
            value={data ? formatCurrency(data.outstandingInvoicesTotal) : '$0.00'}
            icon={ReceiptText}
            loading={loading}
            highlight="green"
            href="/sales"
          />
          <KpiCard
            label="AP due"
            value={formatCurrency(apTotal)}
            icon={ShoppingCart}
            loading={loading}
            highlight="red"
            href="/purchases"
          />
          <KpiCard
            label="Items needing review"
            value={String(pendingReceipts)}
            icon={BellDot}
            loading={loading}
            highlight="default"
            href="/inbox"
          />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<'loading' | 'public' | 'app'>(() => {
    if (typeof window === 'undefined') return 'loading';
    return isAuthenticated() ? 'app' : 'public';
  });

  useEffect(() => {
    setMode(isAuthenticated() ? 'app' : 'public');
  }, []);

  if (mode === 'public') return <MarketingLanding />;
  if (mode === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">Loading...</div>
    );
  }
  return <Dashboard />;
}
