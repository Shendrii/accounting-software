'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Building2, FileText } from 'lucide-react';
import { getBills, type Bill } from '@/lib/api';

function currency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function PurchasesPage() {
  const [summary, setSummary] = useState({ dueSoonCount: 0, dueTotal: 0 });

  useEffect(() => {
    getBills({ status: 'RECEIVED' }).then((bills: Bill[]) => {
      const cutoff = Date.now() + 7 * 86400000;
      const dueSoon = bills.filter((bill) => new Date(bill.dueDate).getTime() <= cutoff);
      setSummary({ dueSoonCount: dueSoon.length, dueTotal: dueSoon.reduce((sum, bill) => sum + Number(bill.total), 0) });
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen lg:pl-64">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Purchases (AP)</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Vendors, bills, and recurring commitments in one workflow.</p>
        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-950/30">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{summary.dueSoonCount} bill{summary.dueSoonCount === 1 ? '' : 's'} due in the next 7 days</p>
          <p className="mt-1 text-2xl font-semibold text-blue-950 dark:text-blue-100">{currency(summary.dueTotal)} due soon</p>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href="/purchases/vendors" className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <Building2 className="h-6 w-6 text-blue-600" /><h2 className="mt-3 font-semibold">Vendors</h2><p className="mt-1 text-sm text-zinc-500">Manage supplier information.</p>
          </Link>
          <Link href="/purchases/bills" className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <FileText className="h-6 w-6 text-blue-600" /><h2 className="mt-3 font-semibold">Bills and recurring bills</h2><p className="mt-1 text-sm text-zinc-500">Receive, pay, and schedule payables.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
