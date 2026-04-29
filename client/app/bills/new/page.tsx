'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, ArrowLeft, Loader2 } from 'lucide-react';
import { getVendors, getAccounts, createBill, type Vendor, type Account, type BillLineInput } from '@/lib/api';
import { toast } from '@/lib/toast';

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  accountId: string;
}

const emptyLine = (): LineItem => ({
  description: '',
  quantity: '1',
  unitPrice: '0.00',
  amount: '0.00',
  accountId: '',
});

export default function NewBillPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getVendors({ isActive: true }), getAccounts()]).then(([v, a]) => {
      setVendors(v);
      setAccounts(a.filter((acc) => acc.isActive));
    }).finally(() => setInitLoading(false));
  }, []);

  function updateLine(index: number, field: keyof LineItem, value: string) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = parseFloat(field === 'quantity' ? value : next[index].quantity) || 0;
        const price = parseFloat(field === 'unitPrice' ? value : next[index].unitPrice) || 0;
        next[index].amount = (qty * price).toFixed(2);
      }
      return next;
    });
  }

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) { setError('Please select a vendor'); return; }
    if (lines.some((l) => !l.description.trim())) { setError('All line items must have a description'); return; }
    setSaving(true);
    setError(null);
    try {
      const bill = await createBill({
        vendorId,
        date,
        dueDate,
        notes,
        lines: lines.map((l): BillLineInput => ({
          description: l.description,
          quantity: parseFloat(l.quantity) || 0,
          unitPrice: parseFloat(l.unitPrice) || 0,
          amount: parseFloat(l.amount) || 0,
          accountId: l.accountId || undefined,
        })),
      });
      toast.success('Bill created');
      router.push(`/bills/${bill.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create bill');
      setSaving(false);
    }
  }

  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE');

  if (initLoading) {
    return (
      <div className="lg:pl-64 min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-8 w-32 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:pl-64 min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/bills" className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <ArrowLeft className="h-5 w-5 text-zinc-600" />
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">New Bill</h1>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Bill Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Vendor *</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Bill Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Due Date *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Line Items</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left py-2 pr-2 text-xs font-medium text-zinc-500 uppercase">Description</th>
                    <th className="text-left py-2 px-2 w-24 text-xs font-medium text-zinc-500 uppercase">Qty</th>
                    <th className="text-left py-2 px-2 w-32 text-xs font-medium text-zinc-500 uppercase">Unit Price</th>
                    <th className="text-left py-2 px-2 w-32 text-xs font-medium text-zinc-500 uppercase">Expense Account</th>
                    <th className="text-right py-2 pl-2 w-28 text-xs font-medium text-zinc-500 uppercase">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 pr-2">
                        <input
                          value={line.description}
                          onChange={(e) => updateLine(i, 'description', e.target.value)}
                          placeholder="Item description"
                          className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.quantity}
                          onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={line.accountId}
                          onChange={(e) => updateLine(i, 'accountId', e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        >
                          <option value="">None</option>
                          {expenseAccounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pl-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                        ${parseFloat(line.amount || '0').toFixed(2)}
                      </td>
                      <td className="py-2 pl-1">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setLines((l) => l.filter((_, j) => j !== i))}
                            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => setLines((l) => [...l, emptyLine()])}
              className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              <Plus className="h-4 w-4" />
              Add line item
            </button>

            <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4 max-w-xs ml-auto">
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/bills"
              className="px-5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Bill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
