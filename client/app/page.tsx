'use client';

import Link from 'next/link';
import { ArrowUpRight, BookOpenCheck, Inbox, Landmark, Plus, ReceiptText, ShoppingCart, Wallet } from 'lucide-react';
import { fetchDashboard, getBills, getCloseChecklist, getInvoices, getPendingReceiptCount } from '@/lib/api';
import { useIsAuthenticated } from '@/lib/auth';
import { decimalText, decimalUnits, formatUsd, localDay } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { MarketingLanding } from '@/app/components/MarketingLanding';
import { CloseProgress, InvoiceActivity, WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { WorkspaceHeading, WorkspaceMetric, WorkspaceNotice, WorkspacePanel, WorkspaceRow } from '@/app/components/WorkspaceUI';

const openBills = async () => (await getBills({ status: 'RECEIVED' })).filter(bill => bill.postingEntryId);
const recentInvoices = () => getInvoices();

function Dashboard() {
  const summary = useWorkspaceData(fetchDashboard);
  const bills = useWorkspaceData(openBills);
  const receipts = useWorkspaceData(getPendingReceiptCount);
  const close = useWorkspaceData(getCloseChecklist);
  const invoices = useWorkspaceData(recentInvoices);
  const overdueBills = bills.data?.filter(bill => bill.dueDate.slice(0, 10) < localDay());
  const reviewCount = receipts.data ?? undefined;
  const unpaidTotal = bills.data?.reduce((total, bill) => total + decimalUnits(bill.balanceDue ?? bill.total), BigInt(0));
  const empty = summary.data && bills.data?.length === 0 && invoices.data?.length === 0 && reviewCount === 0
    && close.data && close.data.draftJournalEntries === 0 && close.data.unmatchedBankTransactions === 0
    && decimalUnits(summary.data.cashBalance) === BigInt(0);
  const metricsFailed = summary.error || bills.error || receipts.error;
  const formatCount = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

  function retryMetrics() {
    if (summary.error) summary.retry();
    if (bills.error) bills.retry();
    if (receipts.error) receipts.retry();
  }

  return (
    <div className="workspace-page">
      <div className="workspace-content space-y-5">
        <WorkspaceHeading section="Workspace" title="Accounting overview" description="See what needs your attention and pick up the next task."
          actions={<>
            <Link href="/sales/invoices/new" className="workspace-primary"><Plus className="size-4" aria-hidden="true" />New invoice</Link>
            <Link href="/inbox#upload-receipt" className="workspace-button"><Inbox className="size-4" aria-hidden="true" />Upload receipt</Link>
          </>} />

        {metricsFailed && <WorkspaceNotice title="Some totals could not load" onRetry={retryMetrics}>
          Figures that could not load are marked unavailable. You can still use the workspace.
        </WorkspaceNotice>}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <WorkspaceMetric label="Cash position" icon={Wallet} href="/banking" value={summary.data ? formatUsd(summary.data.cashBalance) : '—'} detail={summary.loading ? 'Loading…' : summary.error ? 'Unavailable' : 'Posted cash accounts'} />
          <WorkspaceMetric label="Outstanding invoices" icon={ReceiptText} href="/sales" value={summary.data ? formatUsd(summary.data.outstandingInvoicesTotal) : '—'}
            detail={summary.data ? formatCount(summary.data.outstandingInvoicesCount, 'open invoice') : summary.loading ? 'Loading…' : 'Unavailable'} />
          <WorkspaceMetric label="Bills to pay" icon={ShoppingCart} href="/purchases" value={unpaidTotal === undefined ? '—' : formatUsd(decimalText(unpaidTotal))}
            detail={bills.data ? formatCount(bills.data.length, 'unpaid bill') : bills.loading ? 'Loading…' : 'Unavailable'} />
          <WorkspaceMetric label="Items to review" icon={Inbox} href="/inbox" value={reviewCount === undefined ? '—' : String(reviewCount)}
            detail={reviewCount !== undefined ? 'Receipts in your inbox' : receipts.loading ? 'Loading…' : 'Unavailable'} />
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
                <WorkspaceRow icon={Inbox} title={reviewCount === undefined ? 'Receipt review' : formatCount(reviewCount, 'receipt') + ' to review'}
                  detail={receipts.error ? 'The inbox count is unavailable.' : 'Check extracted details before posting.'} href="/inbox" action="Review" />
                <WorkspaceRow icon={ShoppingCart} title={overdueBills ? formatCount(overdueBills.length, 'overdue bill') : 'Overdue bills'}
                  detail={bills.error ? 'The bills count is unavailable.' : 'Review vendor due dates.'} href="/purchases/bills" action="View" />
                <WorkspaceRow icon={Landmark} title={close.data ? formatCount(close.data.unmatchedBankTransactions, 'unmatched bank line') : 'Bank matching'}
                  detail="Review imported statement transactions." href="/banking" action="Match" />
              </div>
            </WorkspacePanel>
            <WorkspacePanel title="Period close" description="Current workspace checklist"
              action={<Link href="/ledger" className="workspace-text-action"><ArrowUpRight className="size-4" aria-hidden="true" />Checklist</Link>}>
              {close.data ? <>
                <CloseProgress checklist={close.data} />
                <div className="divide-y divide-slate-200">
                  <WorkspaceRow icon={BookOpenCheck} title={formatCount(close.data.draftJournalEntries, 'draft journal entry')} detail="Review entries before posting." href="/ledger?tab=journal" action="Open" />
                  <WorkspaceRow icon={Wallet} title="Trial balance" detail={<WorkspaceStatus>{close.data.trialBalanceBalanced ? 'Complete' : 'Needs review'}</WorkspaceStatus>} href="/reports?tab=trial-balance" action="View" />
                </div>
              </> : <div className="p-4 text-sm text-slate-600">{close.error
                ? <WorkspaceNotice title="The close checklist could not load" onRetry={close.retry} />
                : <p role="status">Loading close checklist…</p>}</div>}
            </WorkspacePanel>
          </div>
        )}

        <WorkspacePanel title="Recent invoices" description="Draft, collection, and payment status in one place."
          action={<Link href="/sales/invoices" className="workspace-text-action"><ArrowUpRight className="size-4" aria-hidden="true" />All invoices</Link>}>
          {invoices.data?.length ? <InvoiceActivity invoices={invoices.data.slice(0, 4)} /> :
            <div className="p-4 text-sm text-slate-600">{invoices.error
              ? <WorkspaceNotice title="Recent invoices could not load" onRetry={invoices.retry} />
              : invoices.loading ? <p role="status">Loading invoices…</p> : <p>No invoices yet. Create an invoice to get started.</p>}</div>}
        </WorkspacePanel>
      </div>
    </div>
  );
}

export default function Home() {
  const signedIn = useIsAuthenticated();
  return signedIn ? <Dashboard /> : <MarketingLanding />;
}
