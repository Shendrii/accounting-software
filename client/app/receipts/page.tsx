'use client';

import React, { useState, useCallback } from 'react';
import {
  getReceipts,
  getAccounts,
  uploadReceipt,
  updateReceipt,
  approveReceipt,
  attachReceiptToBill,
  rejectReceipt,
  getVendors,
  getBills,
  type Receipt,
  type ReceiptExtractedData,
  type Vendor,
  type Bill,
} from '@/lib/api';
import Link from 'next/link';
import { Search, Upload, Check, X, FileText, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';
import { WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { formatUsd } from '@/lib/money';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
import ReceiptImage from '@/app/components/ReceiptImage';
import { useWorkspaceData } from '@/lib/use-workspace-data';

function validReceiptDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function receiptStatus(receipt: Receipt) {
  if (receipt.status === 'REJECTED') return 'Rejected';
  if (receipt.status === 'APPROVED') return receipt.billId ? 'Attached to bill' : receipt.journalEntryId ? 'Posted expense' : 'Reviewed';
  return validReceiptDate(receipt.extractedData?.invoiceDate || receipt.extractedData?.date || '') ? 'Needs review' : 'Check date';
}

async function loadReceiptLookups() {
  const [accounts, vendors, bills] = await Promise.all([getAccounts(), getVendors({ isActive: true }), getBills()]);
  return {
    accounts: accounts.filter(account => account.isActive), vendors,
    bills: bills.filter(bill => bill.status === 'PAID' || bill.status === 'RECEIVED' && bill.postingEntryId),
  };
}

export function ReceiptsPage({
  title = 'Receipts',
  subtitle = 'Review extracted details, post expenses, and attach supporting documents to bills.',
}: {
  title?: string;
  subtitle?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'all'>('PENDING');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<{ receipt: Receipt } | null>(null);
  const [approveExpenseId, setApproveExpenseId] = useState('');
  const [approvePaymentId, setApprovePaymentId] = useState('');
  const [approving, setApproving] = useState(false);

  const loadReceipts = useCallback(() => getReceipts(statusFilter === 'all' ? undefined : statusFilter), [statusFilter]);
  const queue = useWorkspaceData(loadReceipts);
  const lookups = useWorkspaceData(loadReceiptLookups);
  const receipts = queue.data ?? [];
  const { loading } = queue;
  const accounts = lookups.data?.accounts ?? [];
  const vendors = lookups.data?.vendors ?? [];
  const bills = lookups.data?.bills ?? [];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      setError('Please select a JPEG, PNG, or WebP image');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadReceipt(file);
      queue.retry();
      e.target.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateExtracted = async (id: string, extractedData: ReceiptExtractedData) => {
    try {
      const date = extractedData.invoiceDate || extractedData.date || '';
      if (!validReceiptDate(date)) throw new Error('Confirm a valid receipt date before saving.');
      const payload: ReceiptExtractedData = {
        ...extractedData,
        amount: extractedData.amount ?? extractedData.total ?? extractedData.balanceDue ?? extractedData.amountPaid ?? 0,
        date, invoiceDate: date,
      };
      await updateReceipt(id, { extractedData: payload });
      setEditingId(null);
      queue.retry();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleApprove = async () => {
    if (!approveModal || !approveExpenseId || !approvePaymentId) return;
    if (approveExpenseId === approvePaymentId) {
      setError('Expense and payment accounts must be different');
      return;
    }
    setApproving(true);
    setError(null);
    try {
      await approveReceipt(approveModal.receipt.id, approveExpenseId, approvePaymentId);
      setApproveModal(null);
      setApproveExpenseId('');
      setApprovePaymentId('');
      queue.retry();
      toast.success('Receipt expense posted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectReceipt(id);
      queue.retry();
      toast.success('Receipt rejected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    }
  };

  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE');
  const paymentAccounts = accounts.filter(
    (a) => a.type === 'ASSET' || a.type === 'LIABILITY'
  );

  const displayAmount = (d: Receipt['extractedData']) => {
    if (d == null) return null;
    const n = d.amount ?? d.total ?? d.balanceDue ?? d.amountPaid;
    return typeof n === 'number' ? n : null;
  };

  const filteredReceipts = receipts.filter((r) => {
    const d = r.extractedData;
    const vendor = (d?.vendor || '').toLowerCase();
    const cat = (d?.category || '').toLowerCase();
    const invNo = (d?.invoiceNumber || '').toLowerCase();
    const q = search.toLowerCase();
    const match = search === '' || vendor.includes(q) || cat.includes(q) || invNo.includes(q);
    return match;
  });

  const selected = filteredReceipts.find(receipt => receipt.id === selectedId);

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5">
          <WorkspaceHeading section="Daily work" title={title} description={subtitle}
            actions={<a href="#upload-receipt" className="workspace-primary"><Upload className="size-4" aria-hidden="true" />Upload receipt</a>} />
        </div>

        {queue.error && <div className="mb-5"><WorkspaceNotice title="Receipts could not load" onRetry={queue.retry} /></div>}
        {error && <div className="mb-5"><WorkspaceNotice title="Receipt action could not finish">{error}</WorkspaceNotice></div>}

        <section id="upload-receipt" className="workspace-panel mb-5 scroll-mt-4 px-4 py-3 sm:px-5">
          <label className="flex cursor-pointer flex-wrap items-center gap-3">
            <span className="workspace-icon">
              {uploading ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            </span>
            <span className="min-w-32 flex-1">
              <span className="block text-sm font-semibold">{uploading ? 'Processing receipt…' : 'Add a receipt image'}</span>
              <span className="block text-xs text-slate-600">JPEG, PNG, or WebP</span>
            </span>
            <input type="file" aria-label="Choose receipt image" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect}
              disabled={uploading} className="max-w-full text-sm text-slate-700 file:mr-2 file:min-h-10 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:font-semibold file:text-blue-900" />
          </label>
        </section>

        <nav className="workspace-tabs mb-4" aria-label="Receipt views">
          <button type="button" className="workspace-tab" aria-current={statusFilter === 'PENDING' ? 'page' : undefined}
            onClick={() => { setStatusFilter('PENDING'); setSelectedId(null); }}>Needs review</button>
          <button type="button" className="workspace-tab" aria-current={statusFilter === 'all' ? 'page' : undefined}
            onClick={() => { setStatusFilter('all'); setSelectedId(null); }}>All receipts</button>
        </nav>
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              aria-label="Search receipts" placeholder="Search by vendor or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 text-sm"
            />
          </div>
        </div>

        <WorkspacePanel title="Receipt queue" description={loading ? 'Loading receipts…' : filteredReceipts.length + (filteredReceipts.length === 1 ? ' receipt' : ' receipts')}>
          {loading ? <p role="status" className="p-4 text-sm text-slate-600">Loading receipts…</p> : filteredReceipts.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">{queue.error ? 'Receipt data is unavailable.' : 'No receipts match this view.'}</p>
          ) : (
            <div className="workspace-table-wrap">
              <table className="workspace-table">
                <thead><tr><th scope="col">Receipt</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" className="workspace-number">Amount</th></tr></thead>
                <tbody>{filteredReceipts.map(receipt => {
                  const details = receipt.extractedData;
                  const amount = displayAmount(details);
                  return <tr key={receipt.id} className={selected?.id === receipt.id ? 'bg-blue-50' : undefined}>
                    <td><button type="button" aria-expanded={selected?.id === receipt.id}
                      aria-controls={selected?.id === receipt.id ? 'receipt-review' : undefined}
                      className="workspace-text-action min-h-10 px-0 text-left"
                      onClick={() => { setSelectedId(selected?.id === receipt.id ? null : receipt.id); setEditingId(null); }}>
                      {details?.vendor || details?.invoiceNumber || 'Uploaded receipt'}
                    </button></td>
                    <td className="whitespace-nowrap">{details?.invoiceDate || details?.date || '—'}</td>
                    <td><WorkspaceStatus>{receiptStatus(receipt)}</WorkspaceStatus></td>
                    <td className="workspace-number">{amount === null ? '—' : formatUsd(amount)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </WorkspacePanel>
        {selected && (
          <section className="mt-5 space-y-2" id="receipt-review" aria-label="Receipt review">
            {lookups.error && <WorkspaceNotice title="Receipt accounts, vendors, and bills could not load" onRetry={lookups.retry} />}
            <h2 className="font-semibold text-slate-950">Receipt review</h2>
            <ReceiptCard key={selected.id} receipt={selected}
              isEditing={editingId === selected.id} onStartEdit={() => setEditingId(selected.id)} onCancelEdit={() => setEditingId(null)}
              onSave={data => handleUpdateExtracted(selected.id, data)} onApprove={() => setApproveModal({ receipt: selected })}
              onReject={() => handleReject(selected.id)} canApprove={selected.status === 'PENDING'} vendors={vendors} bills={bills}
              onUpdateMeta={async (vendorId, category, removeLegacyBill) => {
                await updateReceipt(selected.id, { vendorId, category, ...(removeLegacyBill && { billId: null }) });
                queue.retry();
              }}
              onAttach={async (billId, vendorId, category) => {
                await attachReceiptToBill(selected.id, { billId, vendorId, category });
                queue.retry();
                toast.success('Receipt attached. The bill balance is unchanged.');
              }} />
          </section>
        )}

        {/* Approve modal */}
        {approveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                Create journal entry
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Debit expense, credit payment method. Amount:{' '}
                <strong>
                  {(() => {
                    const n = displayAmount(approveModal.receipt.extractedData);
                    return n != null ? n.toFixed(2) : '—';
                  })()}
                </strong>
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Expense account (debit)
                  </label>
                  <select
                    value={approveExpenseId}
                    onChange={(e) => setApproveExpenseId(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 text-sm"
                  >
                    <option value="">Select account</option>
                    {expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} – {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Payment account (credit)
                  </label>
                  <select
                    value={approvePaymentId}
                    onChange={(e) => setApprovePaymentId(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 text-sm"
                  >
                    <option value="">Select account</option>
                    {paymentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} – {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setApproveModal(null);
                    setApproveExpenseId('');
                    setApprovePaymentId('');
                  }}
                  className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approving || !approveExpenseId || !approvePaymentId}
                  className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve & create entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LegacyReceiptsPage() {
  return <LegacyRedirect to="/inbox" />;
}

const CATEGORY_SUGGESTIONS = ['Office Supplies', 'Travel', 'Meals', 'Utilities', 'Software', 'Other'];

function ReceiptCard({
  receipt,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onApprove,
  onReject,
  canApprove,
  vendors,
  bills,
  onUpdateMeta,
  onAttach,
}: {
  receipt: Receipt;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (data: ReceiptExtractedData) => void;
  onApprove: () => void;
  onReject: () => void;
  canApprove: boolean;
  vendors: Vendor[];
  bills: Bill[];
  onUpdateMeta: (vendorId: string | null, category: string | null, removeLegacyBill: boolean) => Promise<void>;
  onAttach: (billId: string, vendorId: string | null, category: string | null) => Promise<void>;
}) {
  // Normalize so old receipts (date, amount) show in new fields (invoiceDate, total)
  const normalizeForEdit = (raw: Receipt['extractedData']): ReceiptExtractedData => {
    if (!raw) return {};
    return {
      ...raw,
      invoiceDate: raw.invoiceDate || raw.date || '',
      dueDate: raw.dueDate ?? '',
      invoiceNumber: raw.invoiceNumber ?? '',
      total: raw.total ?? raw.amount ?? 0,
      amountPaid: raw.amountPaid ?? 0,
      balanceDue: raw.balanceDue ?? 0,
      items: Array.isArray(raw.items) ? raw.items : [],
      date: raw.invoiceDate || raw.date || '',
      amount: raw.amount ?? raw.total ?? raw.balanceDue ?? raw.amountPaid ?? 0,
    };
  };

  const [editData, setEditData] = useState<ReceiptExtractedData>(() => normalizeForEdit(receipt.extractedData));
  const [metaVendorId, setMetaVendorId] = useState(receipt.vendorId ?? '');
  const [metaCategory, setMetaCategory] = useState(receipt.category ?? '');
  const [metaBillId, setMetaBillId] = useState(receipt.billId ?? '');
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState('');
  const d = receipt.extractedData || {};
  const rawDate = d.invoiceDate || d.date || '';
  const dateConfirmed = validReceiptDate(rawDate);
  const vendorBills = bills.filter(bill => !metaVendorId || bill.vendorId === metaVendorId);

  async function saveMeta(attach = false) {
    setMetaSaving(true);
    setMetaError('');
    try {
      if (attach) await onAttach(metaBillId, metaVendorId || null, metaCategory || null);
      else await onUpdateMeta(metaVendorId || null, metaCategory || null, Boolean(receipt.billId && !metaBillId));
    } catch (cause) {
      setMetaError(cause instanceof Error ? cause.message : 'Could not save receipt details.');
    } finally {
      setMetaSaving(false);
    }
  }

  const items = d.items ?? [];
  const fmt = (n: number | undefined) => (n != null && typeof n === 'number' ? n.toFixed(2) : '—');

  return (
    <div className="workspace-panel overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <ReceiptImage key={receipt.id} receiptId={receipt.id} />
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <WorkspaceStatus>{receiptStatus(receipt)}</WorkspaceStatus>
            {receipt.bill && <Link href={`/purchases/bills/${receipt.bill.id}`} className="text-sm font-semibold text-blue-800 underline">{receipt.bill.billNo}</Link>}
            {receipt.journalEntryId && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Linked to journal entry
              </span>
            )}
          </div>
          {receipt.status === 'PENDING' && !dateConfirmed && <div className="mb-3"><WorkspaceNotice title="Check receipt date">
            {rawDate ? 'The extracted date ' + rawDate + ' is invalid. Confirm the date from the original receipt.' : 'Enter the date shown on the original receipt.'}
          </WorkspaceNotice></div>}
          {!isEditing ? (
            <div className="text-sm">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Receipt details</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div><span className="text-zinc-500 dark:text-zinc-400">Invoice #</span> {d.invoiceNumber || '—'}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Total</span> {fmt(d.total ?? d.amount)}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Receipt date</span> {d.invoiceDate || d.date || '—'}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Due Date</span> {d.dueDate || '—'}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Amount Paid</span> {fmt(d.amountPaid)}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Balance Due</span> {fmt(d.balanceDue)}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Vendor</span> {d.vendor || '—'}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Category</span> {d.category || '—'}</div>
                {d.confidence != null && d.confidence > 0 && (
                  <div><span className="text-zinc-500 dark:text-zinc-400">Confidence</span> {(Number(d.confidence) * 100).toFixed(0)}%</div>
                )}
              </div>
              {items.length > 0 && (
                <div className="mt-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <span className="text-zinc-500 dark:text-zinc-400 block mb-1">Items</span>
                  <ul className="text-sm space-y-0.5">
                    {items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{it.description || '—'}</span>
                        <span>{typeof it.amount === 'number' ? it.amount.toFixed(2) : '—'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Edit receipt details</div>
              <div>
                <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Vendor</label>
                <input
                  type="text"
                  value={editData.vendor ?? ''}
                  onChange={(e) => setEditData((p) => ({ ...p, vendor: e.target.value }))}
                  className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Invoice Number</label>
                  <input
                    type="text"
                    value={editData.invoiceNumber ?? ''}
                    onChange={(e) => setEditData((p) => ({ ...p, invoiceNumber: e.target.value }))}
                    className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
                <div>
                  <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Category</label>
                  <input
                    type="text"
                    value={editData.category ?? ''}
                    onChange={(e) => setEditData((p) => ({ ...p, category: e.target.value }))}
                    className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="receipt-confirmed-date" className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Confirmed receipt date</label>
                  <input
                    id="receipt-confirmed-date" type="date"
                    value={validReceiptDate(editData.invoiceDate || editData.date || '') ? (editData.invoiceDate || editData.date) : ''}
                    onChange={e => setEditData(current => ({ ...current, invoiceDate: e.target.value, date: e.target.value }))}
                    className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
                <div>
                  <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Due Date</label>
                  <input
                    type="text"
                    value={editData.dueDate ?? ''}
                    onChange={(e) => setEditData((p) => ({ ...p, dueDate: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                    className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Total</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editData.total ?? editData.amount ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? parseFloat(e.target.value) : 0;
                      setEditData((p) => ({ ...p, total: v, amount: v }));
                    }}
                    className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
                <div>
                  <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Amount Paid</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editData.amountPaid ?? ''}
                    onChange={(e) => setEditData((p) => ({ ...p, amountPaid: e.target.value ? parseFloat(e.target.value) : 0 }))}
                    placeholder="0"
                    className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
                <div>
                  <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Balance Due</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editData.balanceDue ?? ''}
                    onChange={(e) => setEditData((p) => ({ ...p, balanceDue: e.target.value ? parseFloat(e.target.value) : 0 }))}
                    placeholder="0"
                    className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Items</label>
                <div className="space-y-1">
                  {(editData.items ?? []).map((it, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Description"
                        value={it.description}
                        onChange={(e) => {
                          const next = [...(editData.items ?? [])];
                          next[i] = { ...next[i], description: e.target.value };
                          setEditData((p) => ({ ...p, items: next }));
                        }}
                        className="flex-1 min-w-0 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={it.amount || ''}
                        onChange={(e) => {
                          const next = [...(editData.items ?? [])];
                          next[i] = { ...next[i], amount: e.target.value ? parseFloat(e.target.value) : 0 };
                          setEditData((p) => ({ ...p, items: next }));
                        }}
                        className="w-24 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setEditData((p) => ({ ...p, items: (p.items ?? []).filter((_, j) => j !== i) }))}
                        className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        aria-label="Remove item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditData((p) => ({ ...p, items: [...(p.items ?? []), { description: '', amount: 0 }] }))}
                    className="mt-1 px-2 py-1 text-sm text-zinc-600 dark:text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    + Add item
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Vendor / Category / Bill metadata */}
          {receipt.status === 'PENDING' && !isEditing && <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Expense Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Vendor</label>
                <select
                  value={metaVendorId}
                  onChange={(e) => { setMetaVendorId(e.target.value); setMetaBillId(''); }}
                  className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Category</label>
                <input
                  list={`cat-list-${receipt.id}`}
                  value={metaCategory}
                  onChange={(e) => setMetaCategory(e.target.value)}
                  placeholder="e.g. Travel"
                  className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <datalist id={`cat-list-${receipt.id}`}>
                  {CATEGORY_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label htmlFor="receipt-attach-bill" className="block text-xs text-zinc-500 mb-1">Attach to bill</label>
                <select
                  id="receipt-attach-bill" value={metaBillId}
                  onChange={(e) => setMetaBillId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {vendorBills.map((b) => <option key={b.id} value={b.id}>{b.billNo} ({b.vendor?.name ?? ''})</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="workspace-button" disabled={metaSaving} onClick={() => void saveMeta()}>Save details</button>
              <button type="button" className="workspace-primary" disabled={metaSaving || !dateConfirmed || !metaBillId} onClick={() => void saveMeta(true)}>Attach receipt</button>
            </div>
            <p className="mt-2 text-xs text-slate-600">Attaching a receipt adds evidence. Record payments from the bill in Purchases.</p>
            {metaError && <p role="alert" className="mt-2 text-sm text-red-700">{metaError}</p>}
          </div>}

          <div className="mt-4 flex flex-wrap gap-2">
            {!isEditing ? (
              <>
                {receipt.status === 'PENDING' && (
                  <button
                    onClick={onStartEdit}
                    className="px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    {dateConfirmed ? 'Edit details' : 'Confirm date'}
                  </button>
                )}
                {canApprove && (
                  <>
                    <button
                      disabled={!dateConfirmed || Boolean(metaBillId)}
                      onClick={onApprove}
                      className="disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 bg-green-600 rounded-lg hover:bg-green-700 flex items-center gap-1"
                    >
                      <Check className="h-4 w-4" />
                      Post expense
                    </button>
                    <button
                      onClick={onReject}
                      className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => onSave(editData)}
                  disabled={!validReceiptDate(editData.invoiceDate || editData.date || '')}
                  className="disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-zinc-50 rounded-lg hover:bg-blue-800"
                >
                  Save receipt details
                </button>
                <button
                  onClick={onCancelEdit}
                  className="px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
