import { Check, FileText, Search, Upload, X } from 'lucide-react';
import type { Receipt } from '@/lib/api';

function fmt(n: number | undefined) {
  return n != null ? n.toFixed(2) : '—';
}

export function PortfolioInbox({ receipts }: { receipts: Receipt[] }) {
  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inbox</h1>
          <p className="mt-1 text-zinc-600">Review OCR’d receipts and post journal entries.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
          Manual journal entry
        </span>
      </div>

      <div className="mb-6 rounded-lg border-2 border-dashed border-zinc-300 bg-white p-6">
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-10 w-10 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-700">Drop receipt image or click to upload</span>
          <span className="text-xs text-zinc-500">OCR will extract vendor, date, amount, category</span>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            readOnly
            value=""
            placeholder="Search by vendor or category..."
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm"
          />
        </div>
        <span className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">Pending</span>
      </div>

      <div className="space-y-4">
        {receipts.map((receipt) => {
          const d = receipt.extractedData || {};
          return (
            <div key={receipt.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <div className="flex">
                <div className="flex w-40 shrink-0 items-center justify-center bg-zinc-100">
                  <div className="text-center">
                    <FileText className="mx-auto h-8 w-8 text-zinc-400" />
                    <p className="mt-2 text-xs font-medium text-zinc-500">{d.vendor}</p>
                  </div>
                </div>
                <div className="flex-1 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{receipt.status}</span>
                    <span className="text-xs text-zinc-500">Confidence {(Number(d.confidence ?? 0) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <div><span className="text-zinc-500">Invoice #</span> {d.invoiceNumber}</div>
                    <div><span className="text-zinc-500">Total</span> {fmt(d.total ?? d.amount)}</div>
                    <div><span className="text-zinc-500">Invoice Date</span> {d.invoiceDate}</div>
                    <div><span className="text-zinc-500">Category</span> {d.category}</div>
                    <div><span className="text-zinc-500">Vendor</span> {d.vendor}</div>
                    <div><span className="text-zinc-500">Balance Due</span> {fmt(d.balanceDue)}</div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700">
                      <X className="h-3.5 w-3.5" /> Reject
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
