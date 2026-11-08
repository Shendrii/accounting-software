'use client';
import {useWorkspaces} from '@/app/components/WorkspaceProvider';
import {workspacePermissions} from '@/lib/workspace-permissions';
import { useMoney } from '@/lib/use-money';
import {decimalUnits,decimalText} from '@/lib/money';
import DocumentTaxFields from '@/app/components/DocumentTaxFields';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getVendors, getAccounts, createBill, type Vendor, type Account, type BillLineInput } from '@/lib/api';
import { toast } from '@/lib/toast';
import { DocumentLines, type DocumentLine } from '@/app/components/DocumentLines';
import { WorkspaceHeading, WorkspacePanel } from '@/app/components/WorkspaceUI';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
import RecurringScheduleFields from '@/app/components/RecurringScheduleFields';
import { isPurchaseAccount } from '@/lib/account-roles';

const emptyLine = (): DocumentLine => ({
  description: '',
  quantity: '1',
  unitPrice: '0.00',
  amount: '0.00',
  accountId: '',
});

function BillForm() {
  const money = useMoney();
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [lines, setLines] = useState<DocumentLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [tax,setTax]=useState('0.00'),[taxCodeId,setTaxCode]=useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [schedule, setSchedule] = useState({recurrenceInterval:'monthly',nextDueDate:'',recurrenceAnchorDay:1});
  const [saving, setSaving] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getVendors({ isActive: true }), getAccounts()]).then(([v, a]) => {
      setVendors(v);
      setAccounts(a.filter((acc) => acc.isActive));
    }).catch(() => setError('Could not load vendors and accounts.')).finally(() => setInitLoading(false));
  }, []);

  function updateLine(index: number, field: keyof DocumentLine, value: string) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty=decimalUnits(next[index].quantity,4),price=decimalUnits(next[index].unitPrice);
        next[index].amount=decimalText((qty*price+BigInt(5000))/BigInt(10000));
      }
      return next;
    });
  }

  const total=lines.reduce((s,l)=>s+decimalUnits(l.amount),BigInt(0))+decimalUnits(tax);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) { setError('Please select a vendor'); return; }
    if (lines.some((l) => !l.description.trim())) { setError('All line items must have a description'); return; }
    setSaving(true);
    setError(null);
    try {
      const bill = await createBill({
        vendorId,
        vendorInvoiceNo,
        date,
        dueDate,
        notes,tax,taxCodeId,
        isRecurring,
        recurrenceInterval: isRecurring ? schedule.recurrenceInterval : undefined,
        nextDueDate: isRecurring ? schedule.nextDueDate : undefined,
        recurrenceAnchorDay: isRecurring ? schedule.recurrenceAnchorDay : undefined,
        lines: lines.map((l): BillLineInput => ({
          description: l.description,
          quantity:l.quantity,
          unitPrice:l.unitPrice,
          amount:l.amount,
          accountId: l.accountId || undefined,
        })),
      });
      toast.success('Bill created');
      router.push(`/purchases/bills/${bill.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create bill');
      setSaving(false);
    }
  }

  const expenseAccounts = accounts.filter(isPurchaseAccount);

  if (initLoading) {
    return (
      <div className="workspace-page">
        <div className="workspace-content">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-8 w-32 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
          <div className="workspace-panel mb-5 p-4 sm:p-5 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5">
          <WorkspaceHeading section="Purchases / Bills" title="New bill" description="Capture a vendor bill and the amount due."
            actions={<Link href="/purchases/bills" className="workspace-button"><ArrowLeft className="size-4" aria-hidden="true" />Back to bills</Link>} />
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-5 grid items-start gap-4 xl:grid-cols-[1.65fr_1fr]">
            <div className="workspace-panel p-4 sm:p-5">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Bill details</h2>
              <label className="mb-4 grid gap-1 text-sm font-medium">Supplier invoice number
                <input className="workspace-field" value={vendorInvoiceNo} maxLength={160} onChange={event => setVendorInvoiceNo(event.target.value)} placeholder="The reference printed on the supplier invoice" />
                <span className="text-xs font-normal text-slate-600">Used to prevent recording the same supplier invoice twice.</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="bills-vendorId">Vendor *</label>
                  <select
                    id="bills-vendorId"
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select vendor…</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="bills-date">Bill Date *</label>
                  <input
                    type="date"
                    id="bills-date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="bills-dueDate">Due Date *</label>
                  <input
                    type="date"
                    id="bills-dueDate"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <WorkspacePanel title="Total" description={money.currency}><div className="p-4"><DocumentTaxFields purpose="INPUT" codeId={taxCodeId} onCode={setTaxCode} amount={tax} onAmount={setTax}/></div>
              <p className="p-4 text-2xl font-semibold tabular-nums sm:p-5">{money.format(decimalText(total))}</p>
            </WorkspacePanel>
          </div>

          <div className="mb-5">
            <DocumentLines lines={lines} accounts={expenseAccounts}
              onChange={updateLine} onAdd={() => setLines(current => [...current, emptyLine()])}
              onRemove={index => setLines(current => current.filter((_, position) => position !== index))} />
          </div>

          <div className="workspace-panel mb-5 p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Recurring */}
            <div className="flex items-center gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <input
                type="checkbox"
                id="isRecurring"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isRecurring" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Make this a recurring bill
              </label>
            </div>
            {isRecurring && <RecurringScheduleFields value={schedule} onChange={setSchedule} disabled={saving} />}
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/purchases/bills"
              className="px-5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Bill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function NewBillPage(){const{active}=useWorkspaces();if(!workspacePermissions(active).prepare)return <div className="workspace-page"><div className="workspace-content space-y-4"><p className="text-sm">Your workspace role allows viewing records. Ask an owner for preparation access to create drafts.</p><Link className="workspace-button" href="/purchases/bills">Return to records</Link></div></div>;return <BillForm key={active?.id}/>;}

export default function LegacyNewBillPage() {
  return <LegacyRedirect to="/purchases/bills/new" />;
}
