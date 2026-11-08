'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DraftDocumentEditor from '@/app/components/DraftDocumentEditor';
import RecordAudit from '@/app/components/RecordAudit';
import AppliedCredits from '@/app/components/AppliedCredits';
import {useWorkspaces} from '@/app/components/WorkspaceProvider';
import {workspacePermissions} from '@/lib/workspace-permissions';
import { PaymentCorrections } from '@/app/components/PaymentCorrections';
import BackToWorklist from '@/app/components/BackToWorklist';
import { Loader2 } from 'lucide-react';
import {
  getBill, receiveBill, payBill, voidBill, getAccounts,
  type Bill, type Account,
} from '@/lib/api';
import { toast } from '@/lib/toast';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';
import { billStatus, WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
import AccountingDialog from '@/app/components/AccountingDialog';
import { useMoney } from '@/lib/use-money';
import { decimalUnits, localDay } from '@/lib/money';
import { isPaymentAccount } from '@/lib/account-roles';


function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function BillDetailPage() {
  const { format: formatCurrency } = useMoney();
  const {active}=useWorkspaces();const access=workspacePermissions(active);
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentRequestId, setPaymentRequestId] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const[voiding,setVoiding]=useState(false);
  const [coding, setCoding] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, accs] = await Promise.all([getBill(id), getAccounts()]);
      setBill(b);
      setAccounts(accs.filter(account => account.isActive));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the bill.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function handleReceive() {
    if (!bill) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await receiveBill(bill.id);
      setBill(updated);
      toast.success('Bill posted to the ledger.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to receive bill');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bill || actionLoading) return;
    const values = new FormData(event.currentTarget);
    setActionLoading(true);
    setPaymentError('');
    try {
      const updated = await payBill(bill.id, {
        paymentAccountId: String(values.get('paymentAccountId')),
        amount: String(values.get('amount')), date: String(values.get('date')), requestId: paymentRequestId,
      });
      setBill(updated);
      setPayModalOpen(false);
      toast.success('Payment recorded.');
    } catch (cause) {
      setPaymentError(cause instanceof Error ? cause.message : 'Could not record payment.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVoid(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const fields=new FormData(event.currentTarget);
    if (!bill) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await voidBill(bill.id,{date:String(fields.get('date')),reason:String(fields.get('reason'))});
      setVoiding(false);
      setBill(updated);
      toast.success('Bill voided');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to void bill');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="workspace-page grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="workspace-page grid place-items-center">
        <p className="text-zinc-500">Bill not found.</p>
      </div>
    );
  }

  const amountPaid = bill.amountPaid ?? (bill.status === 'PAID' ? bill.total : '0.00');
  const balanceDue = bill.balanceDue ?? (bill.status === 'RECEIVED' ? bill.total : '0.00');

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5">
          <WorkspaceHeading section="Purchases / Bills" title={bill.billNo}
            description={<>{bill.vendor?.name ?? 'Vendor'} · Due {formatDate(bill.dueDate)}{bill.vendorInvoiceNo ? ' · Supplier invoice ' + bill.vendorInvoiceNo : ''}</>}
            actions={<><WorkspaceStatus>{billStatus(bill)}</WorkspaceStatus><BackToWorklist fallback="/purchases/bills" label="Bills" /></>} />
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {bill.status !== 'VOID' && (bill.status !== 'PAID'||decimalUnits(balanceDue)>BigInt(0)) && (
          <div className="flex flex-wrap gap-3 mb-8">
            {bill.status === 'DRAFT' && access.post && (
              <button
                onClick={handleReceive}
                disabled={actionLoading}
                className="workspace-primary"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Post bill
              </button>
            )}
            {access.post&&['RECEIVED','PAID'].includes(bill.status)&&decimalUnits(balanceDue)>BigInt(0)&&bill.postingEntryId && (
              <button
                onClick={() => {
                  setPaymentRequestId(crypto.randomUUID());
                  setPaymentError('');
                  setPayModalOpen(true);
                }}
                disabled={actionLoading}
                className="workspace-primary"
              >
                Record payment
              </button>
            )}
            {bill.status === 'DRAFT' && access.prepare && <button type="button" className="workspace-button" disabled={actionLoading} onClick={() => setCoding(current => !current)}>Edit draft bill</button>}
            {(bill.status==='DRAFT'?access.prepare:access.correct)&&!bill.isOpeningBalance && decimalUnits(amountPaid) === BigInt(0) && <button
              onClick={()=>setVoiding(true)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            >
              Void bill
            </button>}
          </div>
        )}

        <div className="grid items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
        <section className="workspace-panel min-w-0 p-4 sm:p-5">
          <h2 className="mb-4 font-semibold">Bill details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Vendor</p>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{bill.vendor?.name ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Bill Date</p>
              <p className="text-zinc-700 dark:text-zinc-300">{formatDate(bill.date)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Due Date</p>
              <p className="text-zinc-700 dark:text-zinc-300">{formatDate(bill.dueDate)}</p>
            </div>
          </div>

          <div className="workspace-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Description</th>
                <th className="text-right py-2 text-xs font-medium text-zinc-500 uppercase">Qty</th>
                <th className="text-right py-2 text-xs font-medium text-zinc-500 uppercase">Unit Price</th>
                <th className="text-right py-2 text-xs font-medium text-zinc-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(bill.lines ?? []).map((line) => (
                <tr key={line.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2.5 pr-4">{line.description}</td>
                  <td className="py-2.5 text-right text-zinc-600">{parseFloat(line.quantity).toFixed(2)}</td>
                  <td className="py-2.5 text-right text-zinc-600">{formatCurrency(line.unitPrice)}</td>
                  <td className="py-2.5 text-right font-medium">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4 max-w-xs ml-auto">
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatCurrency(bill.total)}</span>
            </div>
          </div>

          {bill.notes && (
            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{bill.notes}</p>
            </div>
          )}
        </section>
        <WorkspacePanel title="Payment summary">
          <dl className="space-y-2 p-4 text-sm sm:p-5">
            <div className="flex justify-between gap-3"><dt>Bill total</dt><dd>{formatCurrency(bill.total)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Settled · payments and credits</dt><dd>{formatCurrency(amountPaid)}</dd></div>
            {bill.status !== 'DRAFT' && <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold"><dt>Remaining balance</dt><dd>{formatCurrency(balanceDue)}</dd></div>}
          </dl>
          <AppliedCredits kind="bill" allocations={bill.creditAllocations}/><PaymentCorrections kind="bill" documentId={bill.id} payments={bill.payments ?? []} onCorrected={load} />
          {!!bill.receipts?.length && <p className="border-t border-slate-200 p-4 text-sm text-slate-600">
            {bill.receipts.length} attached {bill.receipts.length === 1 ? 'receipt' : 'receipts'} · <Link className="font-semibold text-blue-800 underline" href="/inbox">View receipts</Link>
          </p>}
        </WorkspacePanel>
        </div>

        {coding&&bill.status==='DRAFT'&&<DraftDocumentEditor kind="bill" document={bill} accounts={accounts} onDismiss={()=>setCoding(false)} onSaved={saved=>{setBill(saved as Bill);setCoding(false);}}/>}

        {voiding&&<AccountingDialog title="Void bill with retained history" busy={actionLoading} onDismiss={()=>setVoiding(false)}><form className="grid gap-4" onSubmit={handleVoid}><p className="text-sm">Posted bills receive a dated reversal. The original source and reason stay in history.</p><label className="grid gap-1 text-sm font-semibold">Void date<input className="workspace-field" type="date" name="date" defaultValue={localDay()} required/></label><label className="grid gap-1 text-sm font-semibold">Reason<textarea className="workspace-field min-h-20" name="reason" minLength={5} maxLength={1000} required/></label>{error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}<button className="workspace-primary" disabled={actionLoading}>{actionLoading?'Saving…':'Void bill and retain source history'}</button></form></AccountingDialog>}
        <RecordAudit entityId={bill.id}/>
        {payModalOpen && <AccountingDialog title="Record bill payment" busy={actionLoading} onDismiss={() => setPayModalOpen(false)}>
          <form onSubmit={handlePay} className="space-y-3">
            <p className="text-sm text-slate-600">Record a payment already made. The remaining bill balance is <strong>{formatCurrency(balanceDue)}</strong>.</p>
            <label className="grid gap-1 text-sm font-semibold">Payment account
              <select className="workspace-field" name="paymentAccountId" required disabled={actionLoading}>
                <option value="">Select payment account…</option>
                {accounts.filter(account => isPaymentAccount(account, true)).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">Payment amount
              <input name="amount" className="workspace-field" inputMode="decimal" defaultValue={balanceDue} required disabled={actionLoading} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Payment date
              <input name="date" className="workspace-field" type="date" defaultValue={localDay()} required disabled={actionLoading} />
            </label>
            {paymentError && <WorkspaceNotice title="Payment could not be recorded">{paymentError}</WorkspaceNotice>}
            <div className="flex justify-end gap-2">
              <button type="button" className="workspace-button" disabled={actionLoading} onClick={() => setPayModalOpen(false)}>Cancel</button>
              <button type="submit" className="workspace-primary" disabled={actionLoading}>{actionLoading ? 'Recording…' : 'Record payment'}</button>
            </div>
          </form>
        </AccountingDialog>}
      </div>
    </div>
  );
}

export default function LegacyBillDetailPage() {
  return <LegacyRedirect to="/purchases/bills" preserveLastSegment />;
}
