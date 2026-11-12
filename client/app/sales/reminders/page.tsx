'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { workflowRequest } from '@/lib/practice-api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { useMoney } from '@/lib/use-money';
import { useWorkspaces } from '@/app/components/WorkspaceProvider';
import { WorkflowTabs, WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';
import { ReminderReview } from '@/app/components/InvoiceAutomation';
import AccountingDialog from '@/app/components/AccountingDialog';

function Content() {
  const [page, setPage] = useState(1), [selected, setSelected] = useState(''); const money = useMoney();
  const list = useWorkspaceData(useCallback(() => workflowRequest<{ items: { id: string; invoiceNo: string; customerName: string; email: string; dueDate: string; balance: string }[]; total: number; totalPages: number }>('/invoice-reminders?page=' + page), [page]));
  return <div className="workspace-page"><div className="workspace-content space-y-5"><WorkspaceHeading section="Sales" title="Invoice reminders" description="Review the current recipient and outstanding balance before sending each reminder." /><WorkflowTabs area="sales" active="reminders" />
    <p className="max-w-3xl text-sm leading-relaxed text-slate-600">Enable reviewed reminders on an invoice to include it here. Only posted, overdue invoices with an open balance and a customer email are eligible. Attempts are spaced seven days apart; no emails are sent automatically.</p>
    {list.error && <WorkspaceNotice title="Reminder queue could not load" onRetry={list.retry}>{list.errorMessage}</WorkspaceNotice>}
    <WorkspacePanel title="Due for review" description={(list.data?.total || 0) + ' eligible invoices'}><div className="workspace-table-wrap" aria-busy={list.loading}><table className="workspace-table workbench-table"><thead><tr><th>Invoice</th><th>Customer / recipient</th><th>Due date</th><th className="workspace-number">Balance as of today</th><th>Action</th></tr></thead><tbody>{list.data?.items.map(invoice => <tr key={invoice.id}><td data-label="Invoice"><Link className="workspace-text-action" href={'/sales/invoices/' + invoice.id}>{invoice.invoiceNo}</Link></td><td data-label="Customer / recipient">{invoice.customerName}<p className="break-all text-xs text-slate-600">{invoice.email}</p></td><td data-label="Due date">{invoice.dueDate.slice(0, 10)}</td><td data-label="Balance as of today" className="workspace-number">{money.format(invoice.balance)}</td><td data-label="Action"><button className="workspace-text-action" onClick={() => setSelected(invoice.id)}>Review reminder</button></td></tr>)}</tbody></table></div>{!list.data?.items.length && <p role="status" className="p-5 text-sm text-slate-600">{list.loading ? 'Checking overdue invoices and recent reminders…' : 'No reminders are due. Enable reminders from an open invoice when you want to follow up.'}</p>}<div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><button className="workspace-button" disabled={page <= 1 || list.loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {list.data?.totalPages || 1}</span><button className="workspace-button" disabled={list.loading || page >= (list.data?.totalPages || 1)} onClick={() => setPage(page + 1)}>Next</button></div></WorkspacePanel>
    {selected && <AccountingDialog title="Review invoice reminder" onDismiss={() => setSelected('')}><ReminderReview invoiceId={selected} onSent={list.retry} /></AccountingDialog>}
  </div></div>;
}
export default function Page() { const { active } = useWorkspaces(); return <Content key={active?.id} />; }
