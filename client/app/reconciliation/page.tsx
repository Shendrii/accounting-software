'use client';
import { useMoney } from '@/lib/use-money';

import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, BookOpenCheck, FileSpreadsheet, Landmark } from 'lucide-react';
import {
  completeReconciliation, getAccounts, getReconciliationHistory, importBankTransactions, importCSVTransactions,
  matchTransaction, postBankFee, reviewStatement, unmatchTransaction,
  type ReconciliationRecord, type StatementInput, type StatementReview,
} from '@/lib/api';
import { decimalText, decimalUnits, localDay } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { toast } from '@/lib/toast';
import AccountingDialog from '@/app/components/AccountingDialog';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
import { WorkspaceStatus } from '@/app/components/WorkspaceActivity';
import { WorkspaceHeading, WorkspaceMetric, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

type StatementRow = StatementReview['bankTransactions'][number];
type Action = { kind: 'match' | 'fee'; row: StatementRow } | { kind: 'manual' } | { kind: 'proof'; record: ReconciliationRecord };
const stepLabels = ['Statement details', 'Match transactions', 'Review and finish'];

function nextDate(value: string) {
  const date = new Date(value.slice(0, 10) + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function Amounts({ rows }: { rows: [string, string][] }) {
  const money = useMoney();
  return <dl className="divide-y divide-slate-100 px-4 sm:px-5">
    {rows.map(([label, amount]) => <div key={label} className="flex justify-between gap-3 py-2.5 text-sm last:font-semibold">
      <dt>{label}</dt><dd className="shrink-0 tabular-nums">{money.format(amount)}</dd>
    </div>)}
  </dl>;
}

export function ReconciliationPage() {
  const money = useMoney();
  const accounts = useWorkspaceData(getAccounts);
  const [tab, setTab] = useState<'reconcile' | 'history'>('reconcile');
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<StatementInput>(() => ({
    accountId: '', statementStart: localDay().slice(0, 8) + '01', statementDate: localDay(), openingBalance: '', statementBalance: '', statementLineCount: '',
  }));
  const [review, setReview] = useState<StatementReview | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [importNote, setImportNote] = useState('');
  const [dialogError, setDialogError] = useState('');
  const loadHistory = useCallback(() => input.accountId ? getReconciliationHistory(input.accountId) : Promise.resolve([]), [input.accountId]);
  const history = useWorkspaceData(loadHistory);
  const bankAccounts = accounts.data?.filter(account => account.isBankAccount && (tab === 'history' || account.isActive)) ?? [];
  const prior = history.data?.find(item => item.proof);
  const expenseAccounts = accounts.data?.filter(account => account.type === 'EXPENSE' && account.isActive) ?? [];

  function field(name: keyof StatementInput, value: string) {
    setInput(current => ({ ...current, [name]: value }));
    setStep(0);
    setReview(null);
    setConfirmed([]);
    setError('');
    if (name === 'accountId') setImportNote('');
  }

  async function loadReview() {
    const result = await reviewStatement(input);
    setReview(result);
    setConfirmed(previous => previous.filter(id => result.outstanding.some(line => line.id === id)));
  }

  async function run(work: () => Promise<void>, inDialog = false) {
    setBusy(true);
    setError('');
    setDialogError('');
    try { await work(); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The request could not finish.';
      (inDialog ? setDialogError : setError)(message);
    } finally { setBusy(false); }
  }

  function open(next: Action) {
    setDialogError('');
    setAction(next);
  }

  const remaining = review ? decimalUnits(review.statementBalance) - decimalUnits(review.clearedBalance) : BigInt(0);
  const importedAgrees = Boolean(review && decimalUnits(review.importedEnding) === decimalUnits(review.statementBalance) &&
    review.bankTransactions.length === Number(review.statementLineCount));
  const adjustedBank = review ? review.outstanding.filter(line => confirmed.includes(line.id))
    .reduce((sum, line) => sum + decimalUnits(line.amount), decimalUnits(review.statementBalance)) : BigInt(0);
  const difference = review ? adjustedBank - decimalUnits(review.adjustedBook) : BigInt(0);
  const ready = Boolean(review && review.openingAgrees && importedAgrees && !review.unresolved &&
    review.outstanding.length === confirmed.length && remaining === BigInt(0) && difference === BigInt(0));

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy || action.kind === 'proof') return;
    const values = new FormData(event.currentTarget);
    await run(async () => {
      if (action.kind === 'match') await matchTransaction(action.row.id, String(values.get('journalLineId')));
      if (action.kind === 'fee') await postBankFee(action.row.id, String(values.get('expenseAccountId')));
      if (action.kind === 'manual') {
        const result = await importBankTransactions(input.accountId, [{
          date: String(values.get('date')), description: String(values.get('description')), amount: String(values.get('amount')),
        }]);
        setImportNote(result.imported ? 'Statement line added.' : 'This statement line is already imported.');
      }
      setAction(null);
      await runRefresh();
    }, true);
  }

  async function runRefresh() {
    try {
      if (step > 0) await loadReview();
    } catch (cause) {
      setReview(null);
      setStep(0);
      setError(cause instanceof Error ? cause.message : 'Open the statement again to refresh.');
    }
  }

  async function finish() {
    await run(async () => {
      try {
        await completeReconciliation(input, confirmed);
        history.retry();
        setReview(null);
        setConfirmed([]);
        setStep(0);
        setTab('history');
        toast.success('Reconciliation saved to History.');
      } catch (cause) {
        await runRefresh();
        throw cause;
      }
    });
  }

  const accountSelect = <div className="grid gap-1 text-sm font-semibold">
    <label htmlFor="statement-bank-account">Bank account</label>
    <select id="statement-bank-account" className="workspace-field" value={input.accountId} required disabled={busy || accounts.loading}
      onChange={event => field('accountId', event.target.value)}>
      <option value="">Select bank account…</option>
      {bankAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
    </select>
  </div>;

  const importActions = input.accountId && <div className="flex flex-wrap items-center gap-2">
    <label className="workspace-button cursor-pointer focus-within:ring-2 focus-within:ring-blue-700">
      <FileSpreadsheet className="size-4" aria-hidden="true" />Import statement CSV
      <input type="file" accept=".csv,text/csv" aria-label="Import statement CSV" className="sr-only" disabled={busy}
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void run(async () => {
            const result = await importCSVTransactions(input.accountId, file);
            setImportNote(result.imported ? result.imported + ' statement lines imported.' : 'These statement lines are already imported.');
            await runRefresh();
          });
        }} />
    </label>
    <button type="button" className="workspace-button" disabled={busy} onClick={() => open({ kind: 'manual' })}>Add statement line</button>
  </div>;

  return <div className="workspace-page"><div className="workspace-content space-y-5">
    <WorkspaceHeading section="Daily work" title="Bank reconciliation" description="Match a bank statement to posted transactions and save the reconciliation proof." />
    <nav className="workspace-tabs" aria-label="Bank reconciliation views">
      {(['reconcile', 'history'] as const).map(view => <button key={view} type="button" className="workspace-tab"
        aria-current={tab === view ? 'page' : undefined} disabled={busy} onClick={() => { setTab(view); setError(''); }}>
        {view === 'reconcile' ? 'Reconcile' : 'History'}
      </button>)}
    </nav>
    {error && <WorkspaceNotice title="Reconciliation needs attention">{error}</WorkspaceNotice>}
    {accounts.error && <WorkspaceNotice title="Bank accounts could not load" onRetry={accounts.retry} />}
    {tab === 'history' ? <WorkspacePanel title="Reconciliation history" description="Review completed statements and their saved proof.">
      <div className="space-y-3 p-4">
        {accountSelect}
        {history.loading && <p role="status" className="text-sm text-slate-600">Loading history…</p>}
        {history.error && <WorkspaceNotice title="History could not load" onRetry={history.retry} />}
        {input.accountId && history.data?.length === 0 && <p className="text-sm text-slate-600">No reconciliations for this account yet.</p>}
        {history.data?.map(record => <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-3">
          <div><p className="text-sm font-semibold">{record.statementDate.slice(0, 10)} · {money.format(record.statementBalance)}</p>
            <p className="text-xs text-slate-600">{record.proof ? 'Verified reconciliation' : 'Legacy record · saved proof unavailable'}</p></div>
          {record.proof && <button type="button" className="workspace-button" onClick={() => open({ kind: 'proof', record })}>View proof</button>}
        </div>)}
      </div>
    </WorkspacePanel> : <>
      <ol aria-label="Reconciliation steps" className="grid grid-cols-3 gap-2 text-xs font-semibold sm:text-sm">
        {stepLabels.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}
          className={'flex flex-wrap items-center gap-1.5 ' + (step === index ? 'text-blue-800' : 'text-slate-600')}>
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-slate-200 bg-white">{step > index ? '✓' : index + 1}</span>{label}
        </li>)}
      </ol>
      {step === 0 && <div className="grid items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
        <WorkspacePanel title="Statement details" description="Use the dates and balances printed on your bank statement.">
          <form className="grid gap-4 p-4 sm:p-5" onSubmit={event => {
            event.preventDefault();
            void run(async () => { await loadReview(); setStep(1); });
          }}>
            {accountSelect}
            {!accounts.loading && !accounts.error && !bankAccounts.length && <p className="text-sm text-slate-600">
              Mark an active asset as a bank account in <Link className="font-semibold text-blue-800 underline" href="/ledger?tab=accounts">Chart of accounts</Link>.
            </p>}
            {prior?.proof && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
              <p>Last statement ended {prior.statementDate.slice(0, 10)} with {money.format(prior.statementBalance)}.</p>
              <button type="button" className="workspace-button" disabled={busy} onClick={() => {
                field('statementStart', nextDate(prior.statementDate));
                field('openingBalance', prior.statementBalance);
              }}>Use as opening balance</button>
            </div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">Statement starting date<input required type="date" className="workspace-field" value={input.statementStart} disabled={busy} onChange={event => field('statementStart', event.target.value)} /></label>
              <label className="grid gap-1 text-sm font-semibold">Statement ending date<input required type="date" min={input.statementStart} className="workspace-field" value={input.statementDate} disabled={busy} onChange={event => field('statementDate', event.target.value)} /></label>
              <label className="grid gap-1 text-sm font-semibold">Statement opening balance<input required inputMode="decimal" className="workspace-field" placeholder="0.00" value={input.openingBalance} disabled={busy} onChange={event => field('openingBalance', event.target.value)} /></label>
              <label className="grid gap-1 text-sm font-semibold">Statement ending balance<input required inputMode="decimal" className="workspace-field" placeholder="0.00" value={input.statementBalance} disabled={busy} onChange={event => field('statementBalance', event.target.value)} /></label>
              <label className="grid gap-1 text-sm font-semibold">Statement transaction count<input required inputMode="numeric" pattern="[0-9]{1,7}" className="workspace-field" placeholder="0 for no activity" value={input.statementLineCount} disabled={busy} onChange={event => field('statementLineCount', event.target.value)} /></label>
            </div>
            <div className="flex justify-end"><button type="submit" className="workspace-primary" disabled={busy || !input.accountId}>Start reconciliation</button></div>
          </form>
        </WorkspacePanel>
        <WorkspacePanel title="Statement transactions" description="Load the lines from the same statement before matching them.">
          <div className="space-y-3 p-4">
            <p className="text-sm text-slate-600">The CSV needs a date, description, and signed amount, or separate debit and credit columns.</p>
            {importActions || <p className="text-sm text-slate-600">Select a bank account to import transactions.</p>}
            {importNote && <p role="status" className="text-sm font-semibold text-blue-800">{importNote}</p>}
          </div>
        </WorkspacePanel>
      </div>}
      {step === 1 && review && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <WorkspaceMetric icon={Landmark} label="Statement ending balance" value={money.format(review.statementBalance)} detail={'Through ' + review.statementDate} />
          <WorkspaceMetric icon={BookOpenCheck} label="Cleared book balance" value={money.format(review.clearedBalance)} detail="Opening balance plus matched lines" />
          <WorkspaceMetric icon={ArrowLeftRight} label="Remaining to clear" value={money.format(decimalText(remaining))} detail={review.unresolved + ' statement lines to review'} />
        </div>
        {!importedAgrees && <WorkspaceNotice title="Imported lines do not tie to the statement">
          {review.bankTransactions.length} of {review.statementLineCount} statement lines are loaded. Opening balance plus imported activity is {money.format(review.importedEnding)}.
        </WorkspaceNotice>}
        <WorkspacePanel title="Statement transactions" description={review.statementStart + ' through ' + review.statementDate} action={importActions}>
          {importNote && <p role="status" className="px-4 pt-3 text-sm font-semibold text-blue-800">{importNote}</p>}
          {review.bankTransactions.length === 0 && <p className="p-4 text-sm text-slate-600">No statement lines for these dates.</p>}
          {review.bankTransactions.map(row => {
            const eligible = review.outstanding.filter(line => decimalUnits(line.amount) === decimalUnits(row.amount));
            const suggested = eligible.some(line => Math.abs(Date.parse(line.date) - Date.parse(row.date)) <= 5 * 86400000);
            return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 last:border-0">
              <div className="min-w-0"><p className="break-words text-sm font-semibold">{row.description}</p>
                <p className="text-xs text-slate-600">{row.date.slice(0, 10)} · {money.format(row.amount)}{row.matchDescription ? ' · ' + row.matchDescription : ''}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <WorkspaceStatus>{row.validMatch ? 'Matched' : row.isMatched ? 'Check match' : suggested ? 'Suggested match' : 'Unmatched'}</WorkspaceStatus>
                {row.isMatched ? <button type="button" className="workspace-button" disabled={busy}
                  onClick={() => void run(async () => { await unmatchTransaction(row.id); await runRefresh(); })}>Undo match</button> :
                  <>
                    {eligible.length > 0 && <button type="button" className="workspace-button" disabled={busy} onClick={() => open({ kind: 'match', row })}>Review match</button>}
                    {decimalUnits(row.amount) < BigInt(0) && <button type="button" className="workspace-button" disabled={busy}
                      onClick={() => open({ kind: 'fee', row })}>Record bank fee</button>}
                  </>}
              </div>
            </div>;
          })}
        </WorkspacePanel>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="workspace-button" disabled={busy} onClick={() => setStep(0)}>Statement details</button>
          <button type="button" className="workspace-primary" disabled={busy} onClick={() => setStep(2)}>Review reconciliation</button>
        </div>
      </>}
      {step === 2 && review && <>
        <WorkspacePanel title="Confirm outstanding items" description="Confirm that each item is on the books and has yet to clear the bank.">
          {review.outstanding.length === 0 && <p className="p-4 text-sm text-slate-600">No outstanding items.</p>}
          {review.outstanding.map(line => <label key={line.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-200 p-4 text-sm last:border-0">
            <input type="checkbox" className="size-4 shrink-0" checked={confirmed.includes(line.id)} disabled={busy} onChange={event => {
              const checked = event.target.checked;
              setConfirmed(current => checked ? [...current, line.id] : current.filter(id => id !== line.id));
            }} />
            <span className="min-w-0 flex-1"><strong className="break-words">{line.description}</strong>
              <span className="block text-xs text-slate-600">{decimalUnits(line.amount) > BigInt(0) ? 'Deposit in transit' : 'Outstanding payment'} · {line.date.slice(0, 10)}{line.referenceNo ? ' · ' + line.referenceNo : ''}</span>
            </span><span className="shrink-0 tabular-nums">{money.format(line.amount)}</span>
          </label>)}
        </WorkspacePanel>
        <div className="grid items-start gap-3 md:grid-cols-2">
          <WorkspacePanel title="Bank statement"><Amounts rows={[
            ['Statement ending balance', review.statementBalance],
            ['Confirmed timing items', decimalText(adjustedBank - decimalUnits(review.statementBalance))],
            ['Adjusted bank balance', decimalText(adjustedBank)],
          ]} /></WorkspacePanel>
          <WorkspacePanel title="General ledger" description={'Posted activity through ' + review.statementDate}>
            <Amounts rows={[
              ['Opening book balance', review.openingBook],
              ['Other posted activity', decimalText(decimalUnits(review.adjustedBook) - decimalUnits(review.openingBook) - decimalUnits(review.bankFees))],
              ['Bank fees posted', review.bankFees], ['Adjusted book balance', review.adjustedBook],
            ]} />
          </WorkspacePanel>
        </div>
        {ready ? <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Unexplained difference · {money.format(decimalText(difference))}. Ready to complete.</p> :
          <WorkspaceNotice title={'Unexplained difference · ' + money.format(decimalText(difference))}>
            {!review.openingAgrees ? 'The posted opening book balance does not tie to the statement or previous verified proof. Review the opening entries.' :
              !importedAgrees ? 'Verify that the imported transactions add up to the statement ending balance.' :
              review.unresolved ? 'Resolve all unmatched statement lines before finishing.' :
              review.outstanding.length !== confirmed.length ? 'Confirm every outstanding item before finishing.' : 'The adjusted balances must agree before finishing.'}
          </WorkspaceNotice>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="workspace-button" disabled={busy} onClick={() => setStep(1)}>Back to matches</button>
          <button type="button" className="workspace-primary" disabled={busy || !ready} onClick={() => void finish()}>
            {busy ? 'Saving…' : 'Complete reconciliation'}
          </button>
        </div>
      </>}
    </>}
    {action?.kind === 'proof' && action.record.proof && <AccountingDialog title="Saved reconciliation proof" onDismiss={() => setAction(null)}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{action.record.proof.statementStart} through {action.record.proof.statementDate}</p>
        <Amounts rows={[[ 'Statement ending balance', action.record.proof.statementBalance], ['Cleared book balance', action.record.proof.clearedBalance], ['Adjusted bank balance', action.record.proof.adjustedBank], ['Adjusted book balance', action.record.proof.adjustedBook], ['Unexplained difference', action.record.proof.difference]]} />
        <details className="rounded-lg border border-slate-200 p-3 text-sm"><summary>{action.record.proof.matches.length} matched statement lines</summary>
          <ul className="mt-2 space-y-2">{action.record.proof.matches.map(row => <li key={row.id}>{row.date.slice(0, 10)} · {row.description} · {money.format(row.amount)}<br /><span className="text-slate-600">{row.matchDescription}</span></li>)}</ul>
        </details>
        <details className="rounded-lg border border-slate-200 p-3 text-sm"><summary>{action.record.proof.outstanding.length} confirmed outstanding items</summary>
          <ul className="mt-2 space-y-2">{action.record.proof.outstanding.map(line => <li key={line.id}>{line.date.slice(0, 10)} · {line.description} · {money.format(line.amount)}</li>)}</ul>
        </details>
      </div>
    </AccountingDialog>}
    {action && action.kind !== 'proof' && <AccountingDialog title={action.kind === 'match' ? 'Review transaction match' : action.kind === 'fee' ? 'Record bank fee' : 'Add statement line'} busy={busy} onDismiss={() => setAction(null)}>
      <form onSubmit={submitAction} className="space-y-3">
        {action.kind !== 'manual' && <p className="text-sm font-semibold">{action.row.description} · {action.row.date.slice(0, 10)} · {money.format(action.row.amount)}</p>}
        {action.kind === 'match' && <label className="grid gap-1 text-sm font-semibold">Posted ledger transaction
          <select name="journalLineId" className="workspace-field" required disabled={busy}>
            <option value="">Choose the matching transaction…</option>
            {review?.outstanding.filter(line => decimalUnits(line.amount) === decimalUnits(action.row.amount))
              .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(action.row.date)) - Math.abs(Date.parse(b.date) - Date.parse(action.row.date)))
              .map(line => <option key={line.id} value={line.id}>{line.date.slice(0, 10)} · {line.description}</option>)}
          </select>
        </label>}
        {action.kind === 'fee' && <>
          <p className="text-sm text-slate-600">Post only an unrecorded bank charge. This debits the selected expense account and credits the bank account on the transaction date.</p>
          <label className="grid gap-1 text-sm font-semibold">Bank fees expense account
            <select name="expenseAccountId" className="workspace-field" required disabled={busy}>
              <option value="">Select expense account…</option>
              {expenseAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
            </select>
          </label>
        </>}
        {action.kind === 'manual' && <>
          <label className="grid gap-1 text-sm font-semibold">Transaction date<input className="workspace-field" name="date" type="date" required disabled={busy} /></label>
          <label className="grid gap-1 text-sm font-semibold">Description<input className="workspace-field" name="description" required disabled={busy} /></label>
          <label className="grid gap-1 text-sm font-semibold">Amount<input className="workspace-field" name="amount" inputMode="decimal" placeholder="Negative for a withdrawal" required disabled={busy} /></label>
        </>}
        {dialogError && <WorkspaceNotice title="Could not save">{dialogError}</WorkspaceNotice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="workspace-button" disabled={busy} onClick={() => setAction(null)}>Cancel</button>
          <button type="submit" className="workspace-primary" disabled={busy}>{action.kind === 'match' ? 'Confirm match' : action.kind === 'fee' ? 'Post fee and match' : 'Add line'}</button>
        </div>
      </form>
    </AccountingDialog>}
  </div></div>;
}

export default function LegacyReconciliationPage() {
  return <LegacyRedirect to="/banking" />;
}
