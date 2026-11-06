'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getCustomers, getAccounts, createInvoice, type Customer, type Account, type InvoiceLineInput } from '@/lib/api';
import { decimalText, decimalUnits } from '@/lib/money';
import { toast } from '@/lib/toast';
import { DocumentLines, type DocumentLine } from '@/app/components/DocumentLines';
import { WorkspaceHeading, WorkspacePanel } from '@/app/components/WorkspaceUI';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';

const emptyLine = (): DocumentLine => ({
  description: '',
  quantity: '1',
  unitPrice: '0.00',
  amount: '0.00',
  accountId: '',
});

export function NewInvoicePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [lines, setLines] = useState<DocumentLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [tax, setTax] = useState('0.00');
  const [saving, setSaving] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getCustomers({ isActive: true }), getAccounts()]).then(([c, a]) => {
      setCustomers(c);
      setAccounts(a.filter((acc) => acc.isActive));
    }).catch(() => setError('Could not load customers and accounts.')).finally(() => setInitLoading(false));
  }, []);

  function updateLine(index: number, field: keyof DocumentLine, value: string) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const quantity = decimalUnits(next[index].quantity, 4);
        const price = decimalUnits(next[index].unitPrice);
        next[index].amount = decimalText((quantity * price + BigInt(5000)) / BigInt(10000));
      }
      return next;
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + decimalUnits(line.amount), BigInt(0));
  const taxAmount = decimalUnits(tax);
  const total = subtotal + taxAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) { setError('Please select a customer'); return; }
    if (lines.some((l) => !l.description.trim())) { setError('All line items must have a description'); return; }
    setSaving(true);
    setError(null);
    try {
      const invoice = await createInvoice({
        customerId,
        date,
        dueDate,
        tax: tax || '0',
        notes,
        lines: lines.map((l): InvoiceLineInput => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice || '0',
          amount: l.amount,
          accountId: l.accountId || undefined,
        })),
      });
      toast.success('Invoice created');
      router.push(`/sales/invoices/${invoice.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice');
      setSaving(false);
    }
  }

  const revenueAccounts = accounts.filter((a) => a.type === 'REVENUE');

  if (initLoading) {
    return (
      <div className="workspace-page">
        <div className="workspace-content">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-8 w-40 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
          <div className="workspace-panel mb-5 p-4 sm:p-5 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5">
          <WorkspaceHeading section="Sales / Invoices" title="New invoice" description="Prepare a draft with the customer, dates, and line items."
            actions={<Link href="/sales/invoices" className="workspace-button"><ArrowLeft className="size-4" aria-hidden="true" />Back to invoices</Link>} />
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-5 grid items-start gap-4 xl:grid-cols-[1.65fr_1fr]">
            <div className="workspace-panel p-4 sm:p-5">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Invoice details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="invoices-customerId">Customer *</label>
                  <select
                    id="invoices-customerId"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="invoices-date">Invoice Date *</label>
                  <input
                    type="date"
                    id="invoices-date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="invoices-dueDate">Due Date *</label>
                  <input
                    type="date"
                    id="invoices-dueDate"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
              <WorkspacePanel title="Totals" description="USD">
                <div className="space-y-2 p-4 text-sm sm:p-5">
                  <div className="flex justify-between gap-2"><span>Subtotal</span><strong className="tabular-nums">${decimalText(subtotal)}</strong></div>
                  <label className="flex items-center justify-between gap-3">Tax
                    <input type="number" min="0" step="0.01" value={tax} onChange={event => setTax(event.target.value)} className="workspace-field max-w-28 text-right" />
                  </label>
                  <div className="flex justify-between gap-2 rounded-lg bg-blue-50 p-3 font-semibold"><span>Total</span><span className="tabular-nums">${decimalText(total)}</span></div>
                </div>
              </WorkspacePanel>
          </div>

          <div className="mb-5">
            <DocumentLines lines={lines} accounts={revenueAccounts}
              onChange={updateLine} onAdd={() => setLines(current => [...current, emptyLine()])}
              onRemove={index => setLines(current => current.filter((_, position) => position !== index))} />
          </div>

          {/* Notes */}
          <div className="workspace-panel mb-5 p-4 sm:p-5">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes or payment terms…"
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/sales/invoices"
              className="px-5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LegacyNewInvoicePage() {
  return <LegacyRedirect to="/sales/invoices/new" />;
}
