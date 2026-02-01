'use client';

import React, { useState, useEffect } from 'react';
import {
  getReceipts,
  getAccounts,
  uploadReceipt,
  updateReceipt,
  approveReceipt,
  rejectReceipt,
  getReceiptImageUrl,
  type Receipt,
  type ReceiptExtractedData,
  type Account,
} from '@/lib/api';
import { Search, Upload, Check, X, FileText, Loader2 } from 'lucide-react';

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<{ receipt: Receipt } | null>(null);
  const [approveExpenseId, setApproveExpenseId] = useState('');
  const [approvePaymentId, setApprovePaymentId] = useState('');
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [receiptsData, accountsData] = await Promise.all([
        getReceipts(statusFilter === 'all' ? undefined : statusFilter),
        getAccounts(),
      ]);
      setReceipts(receiptsData);
      setAccounts(accountsData.filter((a) => a.isActive));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadReceipt(file);
      await loadData();
      e.target.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateExtracted = async (id: string, extractedData: ReceiptExtractedData) => {
    try {
      // Ensure server has amount + date for approve flow (from total/invoiceDate or legacy keys)
      const payload: ReceiptExtractedData = {
        ...extractedData,
        amount: extractedData.amount ?? extractedData.total ?? extractedData.balanceDue ?? extractedData.amountPaid ?? 0,
        date: extractedData.date ?? extractedData.invoiceDate ?? extractedData.dueDate ?? '',
      };
      await updateReceipt(id, { extractedData: payload });
      setEditingId(null);
      await loadData();
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
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectReceipt(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
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

  return (
    <div className="lg:pl-64 min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Receipts
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Upload receipt images to extract data with OCR, review, and create journal entries
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Upload */}
        <div className="mb-6 p-6 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <label className="flex flex-col items-center gap-2 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />
            {uploading ? (
              <Loader2 className="h-10 w-10 text-zinc-500 animate-spin" />
            ) : (
              <Upload className="h-10 w-10 text-zinc-500" />
            )}
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {uploading ? 'Processing…' : 'Drop receipt image or click to upload'}
            </span>
            <span className="text-xs text-zinc-500">OCR + GPT-3.5 will extract vendor, date, amount, category</span>
          </label>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by vendor or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
          </div>
        ) : filteredReceipts.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
            No receipts found. Upload an image to get started.
          </div>
        ) : (
          <div className="space-y-6">
            {filteredReceipts.map((receipt) => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
                isEditing={editingId === receipt.id}
                onStartEdit={() => setEditingId(receipt.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(data) => handleUpdateExtracted(receipt.id, data)}
                onApprove={() => setApproveModal({ receipt })}
                onReject={() => handleReject(receipt.id)}
                canApprove={receipt.status === 'PENDING'}
              />
            ))}
          </div>
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
                  className="flex-1 px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-50 flex items-center justify-center gap-2"
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

function ReceiptCard({
  receipt,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onApprove,
  onReject,
  canApprove,
}: {
  receipt: Receipt;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (data: ReceiptExtractedData) => void;
  onApprove: () => void;
  onReject: () => void;
  canApprove: boolean;
}) {
  // Normalize so old receipts (date, amount) show in new fields (invoiceDate, total)
  const normalizeForEdit = (raw: Receipt['extractedData']): ReceiptExtractedData => {
    if (!raw) return {};
    return {
      ...raw,
      invoiceDate: raw.invoiceDate ?? raw.date ?? '',
      dueDate: raw.dueDate ?? '',
      invoiceNumber: raw.invoiceNumber ?? '',
      total: raw.total ?? raw.amount ?? 0,
      amountPaid: raw.amountPaid ?? 0,
      balanceDue: raw.balanceDue ?? 0,
      items: Array.isArray(raw.items) ? raw.items : [],
      date: raw.date ?? raw.invoiceDate ?? raw.dueDate ?? '',
      amount: raw.amount ?? raw.total ?? raw.balanceDue ?? raw.amountPaid ?? 0,
    };
  };

  const [editData, setEditData] = useState<ReceiptExtractedData>(() => normalizeForEdit(receipt.extractedData));

  useEffect(() => {
    setEditData(normalizeForEdit(receipt.extractedData));
  }, [receipt.extractedData]);

  const d = receipt.extractedData || {};
  const items = d.items ?? [];
  const statusColors = {
    PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
    APPROVED: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
    REJECTED: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
  };
  const fmt = (n: number | undefined) => (n != null && typeof n === 'number' ? n.toFixed(2) : '—');

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-48 shrink-0 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center min-h-[160px]">
          <a
            href={getReceiptImageUrl(receipt.imageUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full"
          >
            <img
              src={getReceiptImageUrl(receipt.imageUrl)}
              alt="Receipt"
              className="w-full h-full object-contain max-h-48"
            />
          </a>
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[receipt.status]}`}>
              {receipt.status}
            </span>
            {receipt.journalEntryId && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Linked to journal entry
              </span>
            )}
          </div>
          {!isEditing ? (
            <div className="text-sm">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Invoice details</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div><span className="text-zinc-500 dark:text-zinc-400">Invoice #</span> {d.invoiceNumber || '—'}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Total</span> {fmt(d.total ?? d.amount)}</div>
                <div><span className="text-zinc-500 dark:text-zinc-400">Invoice Date</span> {d.invoiceDate || d.date || '—'}</div>
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
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Edit invoice details</div>
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
                  <label className="block text-zinc-500 dark:text-zinc-400 mb-0.5">Invoice Date</label>
                  <input
                    type="text"
                    value={editData.invoiceDate ?? editData.date ?? ''}
                    onChange={(e) => setEditData((p) => ({ ...p, invoiceDate: e.target.value, date: e.target.value || p.date }))}
                    placeholder="YYYY-MM-DD"
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
          <div className="mt-4 flex flex-wrap gap-2">
            {!isEditing ? (
              <>
                {receipt.status === 'PENDING' && (
                  <button
                    onClick={onStartEdit}
                    className="px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                )}
                {canApprove && (
                  <>
                    <button
                      onClick={onApprove}
                      className="px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 bg-green-600 rounded-lg hover:bg-green-700 flex items-center gap-1"
                    >
                      <Check className="h-4 w-4" />
                      Approve
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
                  className="px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-zinc-50 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100"
                >
                  Save
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
