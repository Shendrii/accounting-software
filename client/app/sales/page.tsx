'use client';

import Link from 'next/link';
import { CalendarClock, FilePenLine, Plus, ReceiptText } from 'lucide-react';
import { getInvoices } from '@/lib/api';
import { decimalText, decimalUnits, formatUsd, localDay } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { InvoiceActivity } from '@/app/components/WorkspaceActivity';
import { WorkflowTabs, WorkspaceHeading, WorkspaceMetric, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

export default function SalesPage() {
  const { data: invoices, loading, error, retry } = useWorkspaceData(getInvoices);
  const open = invoices?.filter(invoice => invoice.status === 'SENT');
  const overdue = open?.filter(invoice => invoice.dueDate.slice(0, 10) < localDay());
  const drafts = invoices?.filter(invoice => invoice.status === 'DRAFT');
  const sum = (rows: typeof open) => rows
    ? formatUsd(decimalText(rows.reduce((total, invoice) => total + decimalUnits(invoice.balanceDue), BigInt(0))))
    : '—';
  const detail = (count: number | undefined, unit: string) => count === undefined ? loading ? 'Loading…' : 'Unavailable' : `${count} ${unit}`;

  return (
    <div className="workspace-page">
      <div className="workspace-content space-y-5">
        <WorkspaceHeading section="Daily work" title="Sales" description="Manage customers, invoices, and collections."
          actions={<Link href="/sales/invoices/new" className="workspace-primary"><Plus className="size-4" aria-hidden="true" />New invoice</Link>} />
        <WorkflowTabs area="sales" active="summary" />
        {error && <WorkspaceNotice title="Sales activity could not load" onRetry={retry} />}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <WorkspaceMetric label="Outstanding" value={sum(open)} detail={detail(open?.length, 'open invoices')} icon={ReceiptText} href="/sales/invoices" />
          <WorkspaceMetric label="Overdue" value={sum(overdue)} detail={detail(overdue?.length, 'past due')} icon={CalendarClock} href="/sales/invoices" />
          <WorkspaceMetric label="Draft invoices" value={drafts ? String(drafts.length) : '—'} detail={drafts ? 'Awaiting review and posting' : detail(undefined, '')} icon={FilePenLine} href="/sales/invoices" />
        </div>
        <WorkspacePanel title="Invoice activity" description="See what is drafted, posted, or collected."
          action={<Link href="/sales/invoices" className="workspace-text-action">All invoices</Link>}>
          {invoices?.length ? <InvoiceActivity invoices={invoices.slice(0, 6)} /> :
            <p className="p-4 text-sm text-slate-600" role="status">{loading ? 'Loading invoices…' : error ? 'Invoice activity is unavailable.' : 'No invoices yet. Create an invoice to get started.'}</p>}
        </WorkspacePanel>
      </div>
    </div>
  );
}
