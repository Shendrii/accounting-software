'use client';
import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchWorkspaceMembers } from '@/lib/api';
import { getWorkspaceProfile } from '@/lib/books-api';
import { getCurrentUser } from '@/lib/auth';
import { localDay } from '@/lib/money';
import { useMoney } from '@/lib/use-money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { closePeriod, createPeriod, getPeriod, getPeriods, reopenPeriod, saveReview, type CloseAccount } from '@/lib/period-api';
import { useWorkspaces } from './WorkspaceProvider';
import { WorkspaceNotice, WorkspacePanel } from './WorkspaceUI';
import AccountingDialog from './AccountingDialog';
import { WorkspaceStatus } from './WorkspaceActivity';
const labels: Record<string,string> = { OPEN: 'Open item', BLOCKED: 'Blocked', RECONCILED: 'Verified', WAIVED: 'Waived' };
export default function PeriodClose() {
  const { active } = useWorkspaces(); const router = useRouter(); const params = useSearchParams(); const money = useMoney();
  const balanceLabel = (value: string) => value.startsWith('-') ? money.format(value.slice(1)) + ' Cr' : value === '0.00' ? money.format(value) : money.format(value) + ' Dr';
  const load = useCallback(() => Promise.all([getPeriods(), getWorkspaceProfile(), active ? fetchWorkspaceMembers(active.id) : Promise.resolve([])]), [active]);
  const metadata = useWorkspaceData(load); const [periods, profile, members] = metadata.data ?? [[], null, []];
  const id = params.get('period') || periods[0]?.id || '';
  const loadPeriod = useCallback(() => id ? getPeriod(id) : Promise.resolve(null), [id]);
  const detail = useWorkspaceData(loadPeriod); const state = detail.data;
  const [creating, setCreating] = useState(false); const [reviewing, setReviewing] = useState<CloseAccount | null>(null);
  const [signoff, setSignoff] = useState<'close' | 'reopen' | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const manager = active?.role === 'OWNER' || active?.role === 'ADMIN'; const admin = manager || active?.role === 'APPROVER'; const owner = active?.role === 'OWNER';
  async function action(work: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError('');
    try { await work(); setReviewing(null); setSignoff(null); setCreating(false); metadata.retry(); detail.retry(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Close action could not finish.'); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await action(async () => { const item = await createPeriod({ startDate: String(data.get('startDate')), endDate: String(data.get('endDate')), targetDate: String(data.get('targetDate')) }); router.push('/ledger?period=' + item.id); });
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!reviewing || !state) return; const data = new FormData(event.currentTarget);
    void action(() => saveReview(state.id, reviewing.id, { status: String(data.get('status')), ownerId: String(data.get('ownerId')), dueDate: String(data.get('dueDate')), support: String(data.get('support')), reason: String(data.get('reason')), fingerprint: reviewing.fingerprint, reviewedById: '' }));
  }
  return <div className="space-y-4">
    <WorkspacePanel title="Period close" description="Review every account with activity or a balance, then sign off and lock the books. Overdue balances remain collection tasks.">
      <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <label className="grid min-w-48 flex-1 gap-1.5 text-sm font-semibold">Accounting period<select className="workspace-field" value={id} disabled={!periods.length || busy} onChange={event => router.push('/ledger?period=' + event.target.value)}>{!periods.length && <option value="">No close periods yet</option>}{periods.map(item => <option key={item.id} value={item.id}>{item.startDate.slice(0,10)} — {item.endDate.slice(0,10)} · {item.status === 'CLOSED' ? 'Closed' : 'Open'}</option>)}</select></label>
        {manager && <button className="workspace-button" onClick={() => { setCreating(true); setError(''); }}>Start next period</button>}
        {profile && <p className="text-sm">Separate reviewer: {profile.separateCloseReviewer ? 'Required' : 'Not required'} · <Link className="workspace-text-action" href="/settings#posting-controls">Posting controls</Link></p>}
      </div>
      {!metadata.loading && !metadata.error && !periods.length && <p className="border-t border-slate-200 p-4 text-sm text-slate-600">Start a period to derive its account review list. A balanced trial balance or an empty import queue does not close the books.</p>}
      {metadata.loading && <p role="status" className="p-4">Loading close periods…</p>}
      {metadata.error && <WorkspaceNotice title="Close periods could not load" onRetry={metadata.retry} />}
    </WorkspacePanel>
    {detail.error && <WorkspaceNotice title="Close evidence could not load" onRetry={detail.retry} />}
    {id && detail.loading && <p role="status">Loading account evidence…</p>}
    {state && <>
      <WorkspacePanel title={state.status === 'CLOSED' ? 'Saved close proof' : 'Close checks'} description={state.status === 'CLOSED' ? 'The signed-off snapshot is retained. Later corrections require an open accounting date.' : 'Balances and reviews are checked again when you close. Any changed account needs a fresh review.'}>
        <div className="grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
          <p><strong>{state.completed} of {state.accounts.length}</strong> accounts reviewed or waived</p><p>Target: {state.targetDate.slice(0,10)}</p>
          <p>Trial balance: {state.gates.trialBalance ? 'Balanced' : 'Difference — investigate'}</p>
          <p>AR / AP: {state.gates.receivables && state.gates.payables ? 'Agree to ledger' : 'Difference — investigate'} · <Link className="workspace-text-action" href={'/reports/aging?asOf=' + state.endDate.slice(0,10)}>Open aging</Link></p>
          <p>Unposted through cutoff: {state.gates.drafts} journals, {state.gates.draftInvoices} invoices, {state.gates.draftBills} bills</p><p>Documents to review: {state.gates.pendingReceipts}</p>
          {Boolean(state.gates.schedulesMissing)&&<p>Scheduled recognitions / reversals due: {state.gates.schedulesMissing} need review. <Link className="workspace-text-action" href="/ledger/schedules">Open schedules</Link></p>}
          {Boolean(state.gates.taxEvidencePending)&&<p>Pending withholding evidence: {state.gates.taxEvidencePending}. <Link className="workspace-text-action" href="/reports/tax">Review certificates</Link> or document an account waiver.</p>}
          {!state.gates.bankEvidence && <p>Bank/card evidence: statement verification or a documented waiver is still required.</p>}
          {Boolean(state.earlierOpen) && <p>Finish earlier open periods first.</p>}
          {profile?.separateCloseReviewer && !state.gates.separateReview && <p>Assign account reviews to someone other than their preparer.</p>}
          {state.closedAt && <p>Signed off {new Date(state.closedAt).toLocaleString()} · {members.find(member => member.user.id === state.closedById)?.user?.name || state.closedById}</p>}
        </div>
        <div className="flex flex-wrap gap-3 border-t border-slate-200 p-4">
          {admin && state.status === 'OPEN' && <button className="workspace-primary" disabled={!state.canClose || busy || Boolean(profile?.separateCloseReviewer && state.createdById === getCurrentUser()?.id)} onClick={() => { setSignoff('close'); setError(''); }}>Review sign-off</button>}
          {owner && state.status === 'CLOSED' && <button className="workspace-button" onClick={() => { setSignoff('reopen'); setError(''); }}>Reopen with reason</button>}
          <Link className="workspace-button" href={'/reports?tab=trial-balance&asOf=' + state.endDate.slice(0,10)}>View trial balance</Link>
        </div>
      </WorkspacePanel>
      <WorkspacePanel title="Account coverage" description="Every account needs evidence or an explicit waiver. Dr means debit; Cr means credit. Previous reviews stay in the audit history.">
        <div className="workspace-table-wrap"><table className="workspace-table workbench-table"><thead><tr><th>Account</th><th>Closing balance</th><th>Review</th><th>Support / owner</th><th>Action</th></tr></thead><tbody>{state.accounts.map(account => <tr key={account.id}>
          <td data-label="Account">{account.code} · {account.name}</td><td data-label="Closing balance" className="tabular-nums">{balanceLabel(account.balance)}</td>
          <td data-label="Review"><WorkspaceStatus>{labels[account.status] || account.status}</WorkspaceStatus>{account.stale && <p className="mt-1 text-xs">Ledger changed since review.</p>}</td>
          <td data-label="Support / owner" className="max-w-80 break-words">{account.review?.support || account.review?.reason || 'No evidence recorded'}{account.review && <p className="mt-1 text-xs text-slate-600">{members.find(member => member.user.id === account.review?.ownerId)?.user?.name || account.review.ownerId} · Due {account.review.dueDate.slice(0,10)}</p>}{account.bankProof && <p className="mt-1 text-xs">Verified statement at cutoff</p>}</td>
          <td data-label="Action">{state.status === 'OPEN' && active?.role !== 'VIEWER' && <button className="workspace-text-action" onClick={() => { setReviewing(account); setError(''); }}>Review account</button>}</td>
        </tr>)}</tbody></table></div>
      </WorkspacePanel>
    </>}
    {error && !creating && !reviewing && !signoff && <WorkspaceNotice title={error} />}
    {creating && <AccountingDialog title="Start the next close period" busy={busy} onDismiss={() => setCreating(false)}><form className="grid gap-4" onSubmit={create}>
      <p className="text-sm text-slate-600">Periods follow the books start and each other without gaps. Choose your actual close target.</p>
      <label className="grid gap-1.5 text-sm font-semibold">Starting date<input type="date" name="startDate" className="workspace-field" defaultValue={periods[0] ? new Date(new Date(periods[0].endDate).valueOf()+86400000).toISOString().slice(0,10) : profile?.booksStartDate?.slice(0,10) || localDay()} required /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Ending date<input type="date" name="endDate" className="workspace-field" required /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Close target date<input type="date" name="targetDate" className="workspace-field" required /></label>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}<button className="workspace-primary" disabled={busy}>{busy ? 'Starting…' : 'Start period'}</button>
    </form></AccountingDialog>}
    {reviewing && state && <AccountingDialog title={'Review ' + reviewing.code + ' · ' + reviewing.name} busy={busy} onDismiss={() => setReviewing(null)}><form className="grid gap-4" onSubmit={review}>
      <p className="text-sm">Closing balance {balanceLabel(reviewing.balance)}. Review includes the ledger through {state.endDate.slice(0,10)}.</p>
      {['BANK', 'CREDIT_CARD'].includes(reviewing.role) && !reviewing.bankProof && <p className="text-sm text-amber-900">A verified statement ending on this period end is required to mark this account reconciled. <Link href="/banking" className="underline">Open Bank reconciliation</Link>, or document a waiver for review.</p>}
      <label className="grid gap-1.5 text-sm font-semibold">Account owner<select name="ownerId" className="workspace-field" defaultValue={reviewing.review?.ownerId || ''} required><option value="">Assign a workspace member…</option>{members.map(member => <option key={member.user.id} value={member.user.id}>{member.user.name} · {member.role}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-semibold">Review due date<input type="date" name="dueDate" className="workspace-field" defaultValue={reviewing.review?.dueDate.slice(0,10) || state.targetDate.slice(0,10)} required /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Status<select name="status" className="workspace-field" defaultValue={reviewing.status}><option value="OPEN">Open</option><option value="BLOCKED">Blocked</option>{admin && <><option value="RECONCILED">Reconciled with evidence</option><option value="WAIVED">Waived with reason</option></>}</select></label>
      <label className="grid gap-1.5 text-sm font-semibold">Supporting workpaper / statement reference<textarea name="support" className="workspace-field min-h-20" maxLength={2000} defaultValue={reviewing.review?.support || ''} /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Review note, waiver reason, or blocker<textarea name="reason" className="workspace-field min-h-20" maxLength={2000} defaultValue={reviewing.review?.reason || ''} /></label>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}<button className="workspace-primary" disabled={busy}>{busy ? 'Saving…' : 'Save review evidence'}</button>
    </form></AccountingDialog>}
    {signoff && state && <AccountingDialog title={signoff === 'close' ? 'Sign off and lock the books' : 'Reopen accounting periods'} busy={busy} onDismiss={() => setSignoff(null)}><form className="grid gap-4" onSubmit={event => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')); void action(() => signoff === 'close' ? closePeriod(state.id) : reopenPeriod(state.id, reason)); }}>
      <p className="text-sm">{signoff === 'close' ? 'The reviewed evidence will be saved. All posting dates through ' + state.endDate.slice(0,10) + ' will be locked, including corrections and backdated entries.' : 'Reopening also reopens later periods because their brought-forward balances depend on this one. Saved sign-offs stay in the audit history, and every affected account needs review again.'}</p>
      {signoff === 'reopen' && <label className="grid gap-1.5 text-sm font-semibold">Reason<textarea name="reason" className="workspace-field min-h-24" minLength={5} maxLength={1000} required /></label>}
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}<button className="workspace-primary" disabled={busy}>{busy ? 'Saving…' : signoff === 'close' ? 'Sign off and close period' : 'Reopen affected periods'}</button>
    </form></AccountingDialog>}
  </div>;
}
