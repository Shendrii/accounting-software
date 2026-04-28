'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import {
  getInvoice, sendInvoice, recordInvoicePayment, voidInvoice, getAccounts,
  type Invoice, type Account,
} from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  SENT: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PAID: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  VOID: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [inv, accs] = await Promise.all([getInvoice(id), getAccounts()]);
      setInvoice(inv);
      setAccounts(accs.filter((a) => a.isActive && a.type === 'ASSET'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSend() {
    if (!invoice) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await sendInvoice(invoice.id);
      setInvoice(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send invoice');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePayment() {
    if (!invoice || !paymentAccountId) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await recordInvoicePayment(invoice.id, paymentAccountId);
      setInvoice(result.invoice);
      setPaymentModalOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to record payment');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVoid() {
    if (!invoice) return;
    if (!confirm('Are you sure you want to void this invoice?')) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await voidInvoice(invoice.id);
      setInvoice(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to void invoice');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="lg:pl-64 min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="lg:pl-64 min-h-screen flex items-center justify-center">
        <p className="text-zinc-500">Invoice not found.</p>
      </div>
    );
  }

  const subtotal = parseFloat(invoice.subtotal);
  const taxAmt = parseFloat(invoice.tax);
  const total = parseFloat(invoice.total);

  return (
    <div className="lg:pl-64 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/invoices" className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <ArrowLeft className="h-5 w-5 text-zinc-600" />
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{invoice.invoiceNo}</h1>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[invoice.status]}`}>
            {invoice.status}
          </span>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
          <div className="flex flex-wrap gap-3 mb-8">
            {invoice.status === 'DRAFT' && (
              <button
                onClick={handleSend}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark as Sent
              </button>
            )}
            {invoice.status === 'SENT' && (
              <button
                onClick={() => setPaymentModalOpen(true)}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                Record Payment
              </button>
            )}
            <button
              onClick={handleVoid}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            >
              Void Invoice
            </button>
          </div>
        )}

        {/* Invoice Details */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Customer</p>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{invoice.customer?.name ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Invoice Date</p>
              <p className="text-zinc-700 dark:text-zinc-300">{formatDate(invoice.date)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Due Date</p>
              <p className="text-zinc-700 dark:text-zinc-300">{formatDate(invoice.dueDate)}</p>
            </div>
          </div>

          {/* Lines */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Description</th>
                <th className="text-right py-2 text-xs font-medium text-zinc-500 uppercase">Qty</th>
                <th className="text-right py-2 text-xs font-medium text-zinc-500 uppercase">Unit Price</th>
                <th className="text-right py-2 text-xs font-medium text-zinc-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lines ?? []).map((line) => (
                <tr key={line.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2.5 pr-4">{line.description}</td>
                  <td className="py-2.5 text-right text-zinc-600">{parseFloat(line.quantity).toFixed(2)}</td>
                  <td className="py-2.5 text-right text-zinc-600">{formatCurrency(line.unitPrice)}</td>
                  <td className="py-2.5 text-right font-medium">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-600">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {taxAmt > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600">Tax</span>
                <span>{formatCurrency(taxAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-zinc-200 dark:border-zinc-700 pt-2">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Payment Modal */}
        {paymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPaymentModalOpen(false)} />
            <div className="relative bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 w-full max-w-sm mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">Record Payment</h3>
                <button onClick={() => setPaymentModalOpen(false)}>
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Select the account that received the payment of <strong>{formatCurrency(invoice.total)}</strong>.
              </p>
              <select
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                <option value="">Select payment account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
              <div className="flex gap-3">
                <button
                  onClick={() => setPaymentModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  disabled={!paymentAccountId || actionLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
