'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FileText, Users } from 'lucide-react';
import { getInvoices, type Invoice } from '@/lib/api';

function currency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function SalesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    getInvoices({ status: 'SENT' }).then(setInvoices).catch(() => {});
  }, []);

  const overdue = invoices.filter((invoice) => new Date(invoice.dueDate) < new Date());
  const outstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);

  return (
    <div className="min-h-screen lg:pl-64">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Sales (AR)</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Customers, invoices, and collections in one workflow.</p>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{overdue.length} invoice{overdue.length === 1 ? '' : 's'} overdue</p>
          <p className="mt-1 text-2xl font-semibold text-amber-950 dark:text-amber-100">{currency(outstanding)} outstanding</p>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href="/sales/customers" className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <Users className="h-6 w-6 text-blue-600" /><h2 className="mt-3 font-semibold">Customers</h2><p className="mt-1 text-sm text-zinc-500">Manage customer records and contact details.</p>
          </Link>
          <Link href="/sales/invoices" className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <FileText className="h-6 w-6 text-blue-600" /><h2 className="mt-3 font-semibold">Invoices</h2><p className="mt-1 text-sm text-zinc-500">Create, send, and collect customer invoices.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
