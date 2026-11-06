'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import {
  getBill, receiveBill, payBill, voidBill, getAccounts,
  type Bill, type Account,
} from '@/lib/api';
import { toast } from '@/lib/toast';
import { WorkspaceHeading, WorkspacePanel } from '@/app/components/WorkspaceUI';
import { billStatus, WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAccountId, setPayAccountId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [b, accs] = await Promise.all([getBill(id), getAccounts()]);
      setBill(b);
      setAccounts(accs.filter((a) => a.isActive && a.type === 'ASSET'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleReceive() {
    if (!bill) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await receiveBill(bill.id);
      setBill(updated);
      toast.success('Bill marked as received');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to receive bill');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePay() {
    if (!bill || !payAccountId) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await payBill(bill.id, payAccountId);
      setBill(updated);
      setPayModalOpen(false);
      toast.success('Bill paid successfully');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to pay bill');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVoid() {
    if (!bill) return;
    if (!confirm('Are you sure you want to void this bill?')) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await voidBill(bill.id);
      setBill(updated);
      toast.success('Bill voided');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to void bill');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="workspace-page grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="workspace-page grid place-items-center">
        <p className="text-zinc-500">Bill not found.</p>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5">
          <WorkspaceHeading section="Purchases / Bills" title={bill.billNo}
            description={<>{bill.vendor?.name ?? 'Vendor'} · Due {formatDate(bill.dueDate)}</>}
            actions={<><WorkspaceStatus>{billStatus(bill)}</WorkspaceStatus><Link href="/purchases/bills" className="workspace-button"><ArrowLeft className="size-4" aria-hidden="true" />Bills</Link></>} />
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {bill.status !== 'VOID' && bill.status !== 'PAID' && (
          <div className="flex flex-wrap gap-3 mb-8">
            {bill.status === 'DRAFT' && (
              <button
                onClick={handleReceive}
                disabled={actionLoading}
                className="workspace-primary"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark as Received
              </button>
            )}
            {bill.status === 'RECEIVED' && (
              <button
                onClick={() => setPayModalOpen(true)}
                disabled={actionLoading}
                className="workspace-primary"
              >
                Pay Bill
              </button>
            )}
            <button
              onClick={handleVoid}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            >
              Void Bill
            </button>
          </div>
        )}

        <div className="grid items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
        <section className="workspace-panel min-w-0 p-4 sm:p-5">
          <h2 className="mb-4 font-semibold">Bill details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Vendor</p>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{bill.vendor?.name ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Bill Date</p>
              <p className="text-zinc-700 dark:text-zinc-300">{formatDate(bill.date)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Due Date</p>
              <p className="text-zinc-700 dark:text-zinc-300">{formatDate(bill.dueDate)}</p>
            </div>
          </div>

          <div className="workspace-table-wrap">
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
              {(bill.lines ?? []).map((line) => (
                <tr key={line.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2.5 pr-4">{line.description}</td>
                  <td className="py-2.5 text-right text-zinc-600">{parseFloat(line.quantity).toFixed(2)}</td>
                  <td className="py-2.5 text-right text-zinc-600">{formatCurrency(line.unitPrice)}</td>
                  <td className="py-2.5 text-right font-medium">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4 max-w-xs ml-auto">
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatCurrency(bill.total)}</span>
            </div>
          </div>

          {bill.notes && (
            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{bill.notes}</p>
            </div>
          )}
        </section>
        <WorkspacePanel title="Payment summary">
          <div className="space-y-2 p-4 sm:p-5">
            <p className="text-sm text-slate-600">{bill.status === 'RECEIVED' ? 'Amount due' : 'Bill total'}</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(bill.total)}</p>
            <WorkspaceStatus>{billStatus(bill)}</WorkspaceStatus>
          </div>
        </WorkspacePanel>
        </div>

        {/* Pay Modal */}
        {payModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPayModalOpen(false)} />
            <div className="relative bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 w-full max-w-sm mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">Pay Bill</h3>
                <button onClick={() => setPayModalOpen(false)} aria-label="Close">
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Select the account to pay <strong>{formatCurrency(bill.total)}</strong> from.
              </p>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select payment account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
              <div className="flex gap-3">
                <button
                  onClick={() => setPayModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePay}
                  disabled={!payAccountId || actionLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Payment
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LegacyBillDetailPage() {
  return <LegacyRedirect to="/purchases/bills" preserveLastSegment />;
}
