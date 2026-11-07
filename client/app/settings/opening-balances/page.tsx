'use client';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { getWorkspaceProfile, postOpeningBalances, previewOpeningBalances, type OpeningInput, type OpeningPreview, type WorkspaceProfile } from '@/lib/books-api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

const headers = { balancesCsv: 'accountCode,debit,credit', receivablesCsv: 'partyName,reference,date,dueDate,amount,accountCode', payablesCsv: 'partyName,reference,date,dueDate,amount,accountCode' };
const labels = { balancesCsv: 'Opening trial balance', receivablesCsv: 'Unpaid customer invoices', payablesCsv: 'Unpaid supplier bills' };
function Review({ preview, posted = false }: { preview: OpeningPreview; posted?: boolean }) {
  const money = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: preview.currency }).format(Number(value));
  return <div className="space-y-5">
    <p className="border-y border-slate-300 py-3 text-sm"><strong>{posted ? 'Posted opening balances' : 'Review before posting'}</strong> · As of {preview.asOf} · {preview.currency} · Accrual basis</p>
    <WorkspacePanel title="Trial balance"><div className="workspace-table-wrap"><table className="workspace-table workbench-table"><caption className="sr-only">Opening balances for review</caption><thead><tr><th scope="col">Account</th><th scope="col" className="workspace-number">Debit</th><th scope="col" className="workspace-number">Credit</th></tr></thead><tbody>{preview.balances.map(row => <tr key={row.accountCode}><td data-label="Account">{row.accountCode} · {row.accountName}</td><td data-label="Debit" className="workspace-number">{money(row.debit)}</td><td data-label="Credit" className="workspace-number">{money(row.credit)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Totals</th><td data-label="Total debits" className="workspace-number">{money(preview.totals.debit)}</td><td data-label="Total credits" className="workspace-number">{money(preview.totals.credit)}</td></tr></tfoot></table></div>{!preview.balances.length && <p className="p-4 text-sm">This workspace starts with zero opening balances.</p>}</WorkspacePanel>
    <WorkspacePanel title="Receivable and payable support" description="Every control-account balance must agree with its individual unpaid documents."><div className="workspace-table-wrap"><table className="workspace-table workbench-table"><thead><tr><th scope="col">Control account</th><th scope="col" className="workspace-number">TB balance</th><th scope="col" className="workspace-number">Documents</th><th scope="col" className="workspace-number">Difference</th></tr></thead><tbody>{preview.controls.map(row => <tr key={row.accountId}><td data-label="Control account">{row.accountCode} · {row.accountName}</td><td data-label="TB balance" className="workspace-number">{money(row.balance)}</td><td data-label="Documents" className="workspace-number">{money(row.support)}</td><td data-label="Difference" className="workspace-number">{money(row.difference)}</td></tr>)}</tbody></table></div></WorkspacePanel>
    {(['receivables', 'payables'] as const).map(kind => <details key={kind} className="border-y border-slate-200 py-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{preview[kind].length} opening {kind === 'receivables' ? 'customer invoices' : 'supplier bills'}</summary><ul className="divide-y divide-slate-200 text-sm">{preview[kind].map((row, index) => <li key={index} className="flex flex-wrap justify-between gap-3 py-3"><span>{row.partyName} · {row.reference}<span className="mt-1 block text-xs text-slate-600">Dated {row.date} · Due {row.dueDate} · Account {row.accountCode}</span></span><span className="tabular-nums">{money(row.amount)}</span></li>)}</ul></details>)}
    {!preview.canPost && <WorkspaceNotice title="Opening balances do not agree">Correct the debit/credit difference or the AR/AP schedules, then review again.</WorkspaceNotice>}
  </div>;
}
function OpeningForm({ profile, refresh }: { profile: WorkspaceProfile; refresh: () => void }) {
  const [inputs, setInputs] = useState<OpeningInput>({ balancesCsv: headers.balancesCsv, receivablesCsv: headers.receivablesCsv, payablesCsv: headers.payablesCsv });
  const [preview, setPreview] = useState<OpeningPreview | null>(null); const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const requestId = useRef('');
  const canEdit = ['OWNER', 'ADMIN'].includes(profile.role);
  if (profile.openingBalance) return <><p role="status" className="mb-5 border-y border-slate-300 py-3 text-sm">Opening balances were finalized on {new Date(profile.openingBalance.createdAt).toLocaleString()}. Original entries and source balances remain available for review.</p><Review preview={profile.openingBalance.snapshot} posted /><div className="mt-6 flex flex-wrap gap-3"><Link href="/reports?tab=trial-balance" className="workspace-primary">View trial balance</Link><Link href="/reports/aging" className="workspace-button">Review AR/AP reconciliation</Link><Link href="/" className="workspace-button">Open dashboard</Link></div></>;
  if (!profile.setupCompletedAt) return <p className="text-sm">Complete the <Link className="workspace-text-action" href="/settings/setup">business profile</Link> before entering opening balances.</p>;
  if (!profile.openingEligible) return <p className="text-sm">This workspace already has posted entries. An opening batch would duplicate the existing books. <Link className="workspace-text-action" href="/reports">Review the current reports</Link>.</p>;
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setConfirmed(false);
    try { setPreview(await previewOpeningBalances(inputs)); requestId.current = crypto.randomUUID(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Opening balances could not be reviewed.'); }
    finally { setBusy(false); }
  }
  async function post() {
    if (!preview?.canPost || !confirmed || busy) return;
    setBusy(true); setError('');
    try { await postOpeningBalances({ ...inputs, requestId: requestId.current }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Opening balances could not be posted. Retry the same request.'); }
    finally { setBusy(false); }
  }
  async function upload(key: keyof typeof headers, file?: File) {
    if (!file) return;
    if (file.size > 1_000_000) { setError('Choose a CSV file smaller than 1 MB.'); return; }
    try { const text = await file.text(); setInputs(previous => ({ ...previous, [key]: text })); setPreview(null); }
    catch { setError('The file could not be read. Try selecting it again.'); }
  }
  return <div className="space-y-5">
    <p className="max-w-3xl text-sm leading-relaxed text-slate-600">Use the closing trial balance from the day before {profile.booksStartDate?.slice(0, 10)}. Include the remaining balances of unpaid invoices and bills as supporting schedules. These documents do not create new revenue or expenses. The reviewed batch posts once.</p>
    {preview ? <><Review preview={preview} /><label className="flex items-start gap-3 border-y border-slate-300 py-4 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy || !canEdit} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed the original balances and supporting documents. Finalize this opening batch in {preview.currency}.</span></label><div className="flex flex-wrap justify-between gap-3"><button type="button" className="workspace-button" disabled={busy} onClick={() => { setPreview(null); setConfirmed(false); }}>Back to source data</button><button type="button" className="workspace-primary" disabled={busy || !canEdit || !confirmed || !preview.canPost} onClick={() => void post()}>{busy ? 'Posting opening balances…' : 'Finalize opening balances'}</button></div></> : <form onSubmit={review} className="space-y-5"><fieldset className="space-y-5" disabled={busy || !canEdit}>
      {(Object.keys(headers) as (keyof typeof headers)[]).map(key => <WorkspacePanel key={key} title={labels[key]} description={key === 'balancesCsv' ? 'Each active account code appears once, with a net debit or credit. No balancing plug is added.' : 'Use original invoice and due dates, an AR/AP control account code, and the outstanding amount only. Blank schedules are allowed when the control balance is zero.'}>
        <div className="space-y-3 p-4 sm:p-5"><label className="grid gap-1.5 text-sm font-semibold">Upload {labels[key].toLowerCase()} CSV<input className="workspace-field" type="file" accept=".csv,text/csv" onChange={event => void upload(key, event.target.files?.[0])} /></label><label className="grid gap-1.5 text-sm font-semibold">{labels[key]} CSV data<textarea className="workspace-field min-h-32 font-mono text-xs" spellCheck={false} value={inputs[key]} onChange={event => setInputs(previous => ({ ...previous, [key]: event.target.value }))} /></label><p className="break-all text-xs text-slate-600">Headers: {headers[key]}</p></div>
      </WorkspacePanel>)}
      <p className="text-sm text-slate-600">Dates use YYYY-MM-DD. Contact names match existing records exactly; new names create contacts. If names are ambiguous, add a partyId column. Opening credits and prepayments need a separate reviewed adjustment; do not net them into these unpaid invoices.</p>
    </fieldset><div className="flex flex-wrap justify-between gap-3"><button type="button" className="workspace-button" disabled={busy || !canEdit} onClick={() => setInputs({ balancesCsv: headers.balancesCsv, receivablesCsv: headers.receivablesCsv, payablesCsv: headers.payablesCsv })}>Start with zero balances</button><button type="submit" className="workspace-primary" disabled={busy || !canEdit}>{busy ? 'Checking balances…' : 'Review opening balances'}</button></div></form>}
    {error && <WorkspaceNotice title="Opening balances need attention">{error}</WorkspaceNotice>}
    {!canEdit && <p className="text-sm text-slate-600">An owner or admin must review and post opening balances.</p>}
  </div>;
}
export default function OpeningBalancesPage() {
  const load = useCallback(() => getWorkspaceProfile(), []); const state = useWorkspaceData(load);
  return <div className="workspace-page"><div className="workspace-content space-y-5"><WorkspaceHeading section="Settings" title="Opening balances" description="Bring forward the client’s existing books without recording sales or expenses twice." actions={<><Link href="/ledger?tab=accounts" className="workspace-button">Chart of accounts</Link><Link href="/settings/setup" className="workspace-button">Business profile</Link></>} />
    {state.loading && <p role="status">Loading opening balances…</p>}{state.error && <WorkspaceNotice title="Opening balances could not load" onRetry={state.retry} />}{state.data && <OpeningForm key={state.data.id} profile={state.data} refresh={state.retry} />}
  </div></div>;
}
