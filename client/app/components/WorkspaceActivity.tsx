import Link from 'next/link';
import type { CloseChecklist, Bill, Invoice } from '@/lib/api';
import { formatUsd, decimalUnits, localDay } from '@/lib/money';
import { cn } from '@/lib/utils';

export const closeItems = [
  ['draftJournalEntries', 'Draft journal entries', '/ledger?tab=journal'],
  ['pendingReceipts', 'Receipts to review', '/inbox'],
  ['overdueInvoices', 'Overdue invoices', '/sales/invoices'],
  ['overdueBills', 'Overdue bills', '/purchases/bills'],
  ['unmatchedBankTransactions', 'Unmatched bank transactions', '/banking'],
] as const;

export function CloseProgress({ checklist }: { checklist: CloseChecklist }) {
  const complete = closeItems.filter(([key]) => checklist[key] === 0).length + Number(checklist.trialBalanceBalanced);
  const total = closeItems.length + 1;
  return (
    <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 sm:px-5">
      <div className="flex justify-between gap-2 text-sm font-semibold text-blue-950">
        <span>Checks complete</span><span>{complete} of {total}</span>
      </div>
      <progress aria-label="Period close checks complete" className="workspace-progress" value={complete} max={total} />
    </div>
  );
}

export function invoiceStatus(invoice: Invoice) {
  if (invoice.status === 'PAID') return 'Paid';
  if (invoice.status === 'DRAFT') return 'Draft';
  if (invoice.status !== 'SENT') return 'Void';
  if (!invoice.postingEntryId) return 'Awaiting posting';
  if (decimalUnits(invoice.balanceDue) > BigInt(0) && invoice.dueDate.slice(0, 10) < localDay()) return 'Overdue';
  return decimalUnits(invoice.amountPaid) > BigInt(0) ? 'Partially paid' : 'Open';
}

export function billStatus(bill: Bill) {
  if (bill.status === 'RECEIVED' && bill.dueDate.slice(0, 10) < localDay()) return 'Overdue';
  return bill.status[0] + bill.status.slice(1).toLowerCase();
}

export function WorkspaceStatus({ children }: { children: string }) {
  const good = ['Paid', 'Complete', 'Posted', 'Matched', 'Approved'].includes(children);
  const warn = ['Awaiting posting', 'Partially paid', 'Needs review', 'Open item', 'Unmatched'].includes(children);
  const bad = ['Overdue', 'Rejected', 'Void'].includes(children);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current', {
      'bg-emerald-50 text-emerald-800': good,
      'bg-amber-50 text-amber-900': warn,
      'bg-rose-50 text-rose-800': bad,
      'bg-slate-100 text-slate-700': !good && !warn && !bad,
    })}>{children}</span>
  );
}

export function InvoiceActivity({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="workspace-table-wrap">
      <table className="workspace-table">
        <thead><tr><th scope="col">Invoice</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col" className="workspace-number">Total</th><th scope="col" className="workspace-number">Balance due</th></tr></thead>
        <tbody>{invoices.map(invoice => (
          <tr key={invoice.id}>
            <td><Link href={`/sales/invoices/${invoice.id}`} className="font-semibold whitespace-nowrap text-blue-800 hover:underline">{invoice.invoiceNo}</Link></td>
            <td>{invoice.customer?.name ?? '—'}</td>
            <td><WorkspaceStatus>{invoiceStatus(invoice)}</WorkspaceStatus></td>
            <td className="workspace-number">{formatUsd(invoice.total)}</td>
            <td className="workspace-number">{invoice.status === 'DRAFT' || invoice.status === 'VOID' ? '—' : formatUsd(invoice.balanceDue)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
