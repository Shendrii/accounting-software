'use client';

import Link from 'next/link';
import { CalendarClock, CalendarDays, Plus, ShoppingCart } from 'lucide-react';
import { getBills, type Bill } from '@/lib/api';
import { decimalText, decimalUnits, formatUsd, localDay } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { billStatus, WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { WorkflowTabs, WorkspaceHeading, WorkspaceMetric, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

export default function PurchasesPage() {
  const { data: bills, loading, error, retry } = useWorkspaceData(getBills);
  const open = bills?.filter(bill => bill.status === 'RECEIVED' && bill.postingEntryId && decimalUnits(bill.balanceDue ?? '0') > BigInt(0));
  const today = localDay();
  const overdue = open?.filter(bill => bill.dueDate.slice(0, 10) < today);
  const cutoff = new Date(today + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() + 7);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  const dueSoon = open?.filter(bill => {
    const due = bill.dueDate.slice(0, 10);
    return due >= today && due <= cutoffDay;
  });
  const sum = (rows: Bill[] | undefined) => rows
    ? formatUsd(decimalText(rows.reduce((total, bill) => total + decimalUnits(bill.balanceDue ?? bill.total), BigInt(0))))
    : '—';
  const detail = (count: number | undefined, unit: string) => count === undefined ? loading ? 'Loading…' : 'Unavailable' : `${count} ${unit}`;

  return (
    <div className="workspace-page">
      <div className="workspace-content space-y-5">
        <WorkspaceHeading section="Daily work" title="Purchases" description="Review vendor bills, due dates, and payments."
          actions={<Link href="/purchases/bills/new" className="workspace-primary"><Plus className="size-4" aria-hidden="true" />New bill</Link>} />
        <WorkflowTabs area="purchases" active="summary" />
        {error && <WorkspaceNotice title="Purchases activity could not load" onRetry={retry} />}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <WorkspaceMetric label="Unpaid bills" value={sum(open)} detail={detail(open?.length, 'open bills')} icon={ShoppingCart} href="/purchases/bills?view=open" />
          <WorkspaceMetric label="Overdue balance" value={sum(overdue)} detail={detail(overdue?.length, 'past due')} icon={CalendarClock} href="/purchases/bills?view=overdue" />
          <WorkspaceMetric label="Due within 7 days" value={sum(dueSoon)} detail={detail(dueSoon?.length, 'bills, including today')} icon={CalendarDays} href="/purchases/bills?view=due-soon" />
        </div>
        <WorkspacePanel title="Recent bills" description="See what is due and what has already been paid."
          action={<Link href="/purchases/bills" className="workspace-text-action">All bills</Link>}>
          {bills?.length ? (
            <div className="workspace-table-wrap">
              <table className="workspace-table">
                <thead><tr><th scope="col">Bill</th><th scope="col">Vendor</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col" className="workspace-number">Open balance</th></tr></thead>
                <tbody>{bills.slice(0, 6).map(bill => (
                  <tr key={bill.id}>
                    <td><Link href={`/purchases/bills/${bill.id}`} className="font-semibold whitespace-nowrap text-blue-800 hover:underline">{bill.billNo}</Link></td>
                    <td>{bill.vendor?.name ?? '—'}</td>
                    <td className="whitespace-nowrap">{bill.dueDate.slice(0, 10)}</td>
                    <td><WorkspaceStatus>{billStatus(bill)}</WorkspaceStatus>{bill.status === 'RECEIVED' && bill.dueDate.slice(0, 10) < today && <p className="mt-1 text-xs text-amber-800">Overdue</p>}</td>
                    <td className="workspace-number">{bill.status === 'DRAFT' || bill.status === 'VOID' ? '—' : formatUsd(bill.balanceDue ?? (bill.status === 'PAID' ? '0' : bill.total))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="p-4 text-sm text-slate-600" role="status">{loading ? 'Loading bills…' : error ? 'Bill activity is unavailable.' : 'No bills yet. Create a bill to get started.'}</p>}
        </WorkspacePanel>
      </div>
    </div>
  );
}
