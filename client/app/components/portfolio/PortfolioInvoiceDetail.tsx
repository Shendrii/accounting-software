import { ArrowLeft, Download, Mail } from 'lucide-react';
import type { Invoice } from '@/lib/api';

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function PortfolioInvoiceDetail({ invoice }: { invoice: Invoice }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="rounded-lg p-2 text-zinc-600">
          <ArrowLeft className="h-5 w-5" />
        </span>
        <h1 className="text-3xl font-bold">{invoice.invoiceNo}</h1>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">{invoice.status}</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700">
          <Download className="h-4 w-4" /> Download PDF
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700">
          <Mail className="h-4 w-4" /> Send by Email
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
          Record Payment
        </span>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-6 grid grid-cols-3 gap-6">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">Customer</p>
            <p className="font-medium">{invoice.customer?.name}</p>
            <p className="text-sm text-zinc-500">{invoice.customer?.email}</p>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">Invoice Date</p>
            <p className="text-zinc-700">{formatDate(invoice.date)}</p>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">Due Date</p>
            <p className="text-zinc-700">{formatDate(invoice.dueDate)}</p>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="py-2 text-left text-xs font-medium uppercase text-zinc-500">Description</th>
              <th className="py-2 text-right text-xs font-medium uppercase text-zinc-500">Qty</th>
              <th className="py-2 text-right text-xs font-medium uppercase text-zinc-500">Unit Price</th>
              <th className="py-2 text-right text-xs font-medium uppercase text-zinc-500">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lines ?? []).map((line) => (
              <tr key={line.id} className="border-b border-zinc-100">
                <td className="py-2.5 pr-4">{line.description}</td>
                <td className="py-2.5 text-right text-zinc-600">{parseFloat(line.quantity).toFixed(2)}</td>
                <td className="py-2.5 text-right text-zinc-600">{formatCurrency(line.unitPrice)}</td>
                <td className="py-2.5 text-right font-medium">{formatCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-4 max-w-xs space-y-2 border-t border-zinc-100 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-600">Subtotal</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-600">Tax</span>
            <span>{formatCurrency(invoice.tax)}</span>
          </div>
          <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-bold">
            <span>Total</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-6 border-t border-zinc-100 pt-4">
            <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">Notes</p>
            <p className="text-sm text-zinc-700">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
