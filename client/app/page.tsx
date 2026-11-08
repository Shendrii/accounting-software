'use client';
import { useMoney } from '@/lib/use-money';

import Link from 'next/link';
import { ArrowUpRight, BookOpenCheck, Inbox, Landmark, Plus, ReceiptText, ShoppingCart, Wallet } from 'lucide-react';
import { fetchDashboard } from '@/lib/api';
import { useIsAuthenticated } from '@/lib/auth';
import { decimalUnits } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { MarketingLanding } from '@/app/components/MarketingLanding';
import { CloseProgress, InvoiceActivity, WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { WorkspaceHeading, WorkspaceMetric, WorkspaceNotice, WorkspacePanel, WorkspaceRow } from '@/app/components/WorkspaceUI';

function Dashboard() {
  const money = useMoney();
  const summary = useWorkspaceData(fetchDashboard);
  const dashboard = summary.data;
  const close = dashboard?.closeChecklist;
  const reviewCount = close?.pendingReceipts;
  const purchases = dashboard?.purchases;
  const invoices = dashboard?.sales.recent;
  const empty = dashboard && purchases?.openCount === 0 && invoices?.length === 0 && reviewCount === 0 &&
    close?.draftJournalEntries === 0 && close.unmatchedBankTransactions === 0 &&
    decimalUnits(dashboard.cashBalance) === BigInt(0);
  const formatCount = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

  return (
    <div className="workspace-page">
      <div className="workspace-content space-y-5">
        <WorkspaceHeading section="Workspace" title="Dashboard" description="See what needs your attention and pick up the next task."
          actions={<>
            <Link href="/sales/invoices/new" className="workspace-primary"><Plus className="size-4" aria-hidden="true" />New invoice</Link>
            <Link href="/purchases/documents#upload-receipt" className="workspace-button"><Inbox className="size-4" aria-hidden="true" />Upload receipt</Link>
          </>} />

        {summary.error && <WorkspaceNotice title="Some totals could not load" onRetry={summary.retry}>
          Figures that could not load are marked unavailable. You can still use the workspace.
        </WorkspaceNotice>}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <WorkspaceMetric label="Cash position" icon={Wallet} href="/banking" value={summary.data ? money.format(summary.data.cashBalance) : '—'} detail={summary.loading ? 'Loading…' : summary.error ? 'Unavailable' : 'Posted cash accounts'} />
          <WorkspaceMetric label="Outstanding invoices" icon={ReceiptText} href="/sales" value={summary.data ? money.format(summary.data.outstandingInvoicesTotal) : '—'}
            detail={summary.data ? formatCount(summary.data.outstandingInvoicesCount, 'open invoice') : summary.loading ? 'Loading…' : 'Unavailable'} />
          <WorkspaceMetric label="Bills to pay" icon={ShoppingCart} href="/purchases" value={purchases ? money.format(purchases.openBalance) : '—'}
            detail={purchases ? formatCount(purchases.openCount, 'unpaid bill') : summary.loading ? 'Loading…' : 'Unavailable'} />
          <WorkspaceMetric label="Items to review" icon={Inbox} href="/purchases/documents?status=PENDING" value={reviewCount === undefined ? '—' : String(reviewCount)}
            detail={reviewCount !== undefined ? 'Receipts in your inbox' : summary.loading ? 'Loading…' : 'Unavailable'} />
        </div>

        {empty ? (
          <WorkspacePanel title="Start keeping your books" description="A few first steps for your workspace.">
            <div className="divide-y divide-slate-200">
              <WorkspaceRow icon={ReceiptText} title="Create your first invoice" detail="Save a draft and review it before posting." href="/sales/invoices/new" action="Create" />
              <WorkspaceRow icon={Landmark} title="Set up bank reconciliation" detail="Choose a bank account and a statement date." href="/banking" action="Set up" />
            </div>
          </WorkspacePanel>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <WorkspacePanel title="Needs attention" description="Go straight to the work that needs a decision.">
              <div className="divide-y divide-slate-200">
                <WorkspaceRow icon={ReceiptText} title={dashboard?.sales ? formatCount(dashboard.sales.overdueCount, 'overdue invoice') : 'Overdue invoices'}
                  detail={dashboard?.sales ? money.format(dashboard.sales.overdueBalance) + ' to follow up.' : 'Unavailable'} href="/sales/invoices?view=overdue" action="Follow up" />
                <WorkspaceRow icon={Inbox} title={reviewCount === undefined ? 'Receipt review' : formatCount(reviewCount, 'receipt') + ' to review'}
                  detail={summary.error ? 'The inbox count is unavailable.' : 'Check extracted details before posting.'} href="/purchases/documents?status=PENDING" action="Review" />
                <WorkspaceRow icon={ShoppingCart} title={purchases ? formatCount(purchases.overdueCount, 'overdue bill') : 'Overdue bills'}
                  detail={summary.error ? 'The bills count is unavailable.' : 'Review vendor due dates.'} href="/purchases/bills" action="View" />
                <WorkspaceRow icon={Landmark} title={close ? formatCount(close.unmatchedBankTransactions, 'unmatched bank line') : 'Bank matching'}
                  detail="Review imported statement transactions." href="/banking" action="Match" />
              </div>
            </WorkspacePanel>
            <WorkspacePanel title="Books review" description={close?.closedThrough ? 'Books closed through ' + close.closedThrough.slice(0,10) : 'No period has been signed off yet.'}
              action={<Link href="/ledger" className="workspace-text-action"><ArrowUpRight className="size-4" aria-hidden="true" />Checklist</Link>}>
              {close ? <>
                <CloseProgress checklist={close} />
                <div className="divide-y divide-slate-200">
                  <WorkspaceRow icon={BookOpenCheck} title={formatCount(close.draftJournalEntries, 'draft journal entry')} detail="Review entries before posting." href="/ledger?tab=journal" action="Open" />
                  <WorkspaceRow icon={Wallet} title="Trial balance" detail={<WorkspaceStatus>{close.trialBalanceBalanced ? 'Balanced' : 'Needs review'}</WorkspaceStatus>} href="/reports?tab=trial-balance" action="View" />
                  <WorkspaceRow icon={Landmark} title={formatCount(close.unverifiedBankAccounts, 'bank/card account') + ' without a verified statement'} detail="No imported lines does not mean an account is reconciled." href="/banking" action="Review" />
                </div>
              </> : <div className="p-4 text-sm text-slate-600">{summary.error
                ? <WorkspaceNotice title="The close checklist could not load" onRetry={summary.retry} />
                : <p role="status">Loading close checklist…</p>}</div>}
            </WorkspacePanel>
          </div>
        )}

        <WorkspacePanel title="Recent invoices" description="Draft, collection, and payment status in one place."
          action={<Link href="/sales/invoices" className="workspace-text-action"><ArrowUpRight className="size-4" aria-hidden="true" />All invoices</Link>}>
          {invoices?.length ? <InvoiceActivity invoices={invoices.slice(0, 4)} /> :
            <div className="p-4 text-sm text-slate-600">{summary.error
              ? <WorkspaceNotice title="Recent invoices could not load" onRetry={summary.retry} />
              : summary.loading ? <p role="status">Loading invoices…</p> : <p>No invoices yet. Create an invoice to get started.</p>}</div>}
        </WorkspacePanel>
      </div>
    </div>
  );
}

export default function Home() {
  const signedIn = useIsAuthenticated();
  return signedIn ? <Dashboard /> : <MarketingLanding />;
}
