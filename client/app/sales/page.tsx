'use client';

import Link from 'next/link';
import { CalendarClock, FilePenLine, Plus, ReceiptText } from 'lucide-react';
import { getSalesSummary } from '@/lib/api';
import { formatUsd } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { InvoiceActivity } from '@/app/components/WorkspaceActivity';
import { WorkflowTabs, WorkspaceHeading, WorkspaceMetric, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

export default function SalesPage() {
  const { data: summary, loading, error, retry } = useWorkspaceData(getSalesSummary);
  const invoices = summary?.recent;
  const detail = (count: number | undefined, unit: string) => count === undefined
    ? loading ? 'Loading…' : 'Unavailable' : `${count} ${unit}`;

  return (
    <div className="workspace-page">
      <div className="workspace-content space-y-5">
        <WorkspaceHeading section="Daily work" title="Sales" description="Manage customers, invoices, and collections."
          actions={<Link href="/sales/invoices/new" className="workspace-primary"><Plus className="size-4" aria-hidden="true" />New invoice</Link>} />
        <WorkflowTabs area="sales" active="summary" />
        {error && <WorkspaceNotice title="Sales activity could not load" onRetry={retry} />}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <WorkspaceMetric label="Open invoice balance" value={summary ? formatUsd(summary.openBalance) : '—'} detail={detail(summary?.openCount, 'posted invoices')} icon={ReceiptText} href="/sales/invoices?view=open" />
          <WorkspaceMetric label="Overdue balance" value={summary ? formatUsd(summary.overdueBalance) : '—'} detail={detail(summary?.overdueCount, 'past due')} icon={CalendarClock} href="/sales/invoices?view=overdue" />
          <WorkspaceMetric label="Draft invoices" value={summary ? String(summary.draftCount) : '—'} detail={summary ? 'Awaiting review and posting' : detail(undefined, '')} icon={FilePenLine} href="/sales/invoices?status=DRAFT" />
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
