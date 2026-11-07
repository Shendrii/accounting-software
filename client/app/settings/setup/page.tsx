'use client';
import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAccounts } from '@/lib/api';
import { getWorkspaceProfile, saveWorkspaceProfile, type SetupInput, type WorkspaceProfile } from '@/lib/books-api';
import { localDay } from '@/lib/money';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { useWorkspaces } from '@/app/components/WorkspaceProvider';
import { WorkspaceHeading, WorkspaceNotice, WorkspacePanel } from '@/app/components/WorkspaceUI';

const entityLabels: Record<string, string> = { SOLE_PROPRIETOR: 'Sole proprietor', PARTNERSHIP: 'Partnership', LLC: 'Limited liability company (LLC)', CORPORATION: 'Corporation', NONPROFIT: 'Nonprofit' };
function SetupForm({ profile, emptyChart }: { profile: WorkspaceProfile; emptyChart: boolean }) {
  const router = useRouter(); const workspaces = useWorkspaces();
  const [country, setCountry] = useState(profile.country ?? '');
  const [currency, setCurrency] = useState(profile.currency);
  const [registered, setRegistered] = useState(profile.taxSettings?.salesTaxRegistered ?? false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const canEdit = profile.role === 'OWNER' || profile.role === 'ADMIN';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields = new FormData(event.currentTarget); const text = (key: string) => String(fields.get(key) ?? '').trim();
    const input: SetupInput = { country: country as 'PH' | 'US', currency, legalName: text('legalName'), entityType: text('entityType'),
      region: country === 'US' ? text('region') : null, booksStartDate: text('booksStartDate'), fiscalYearStartMonth: Number(text('fiscalYearStartMonth')),
      accountingBasis: 'ACCRUAL', createChart: fields.has('createChart'), taxSettings: country === 'PH' ?
        { vatStatus: text('vatStatus'), withholdingAgent: fields.has('withholdingAgent') } :
        { salesTaxRegistered: registered, salesTaxJurisdictions: text('salesTaxJurisdictions'), contractorTracking: fields.has('contractorTracking') } };
    setBusy(true); setError('');
    try { await saveWorkspaceProfile(input); workspaces.retry(); router.push(profile.openingEligible ? '/settings/opening-balances' : '/settings'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Workspace setup could not save.'); setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-6">
    <fieldset disabled={busy || !canEdit} className="space-y-6">
      <WorkspacePanel title="Business and books" description="These settings belong to this client workspace. Your other clients keep their own setup.">
        <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
          <label className="grid gap-1.5 text-sm font-semibold">Legal business name<input name="legalName" className="workspace-field" maxLength={120} defaultValue={profile.legalName ?? profile.name} required autoComplete="organization" /></label>
          <label className="grid gap-1.5 text-sm font-semibold">Business country<select className="workspace-field" value={country} required onChange={event => { const next = event.target.value; setCountry(next); if (!profile.currencyLocked) setCurrency(next === 'PH' ? 'PHP' : 'USD'); setRegistered(false); }}><option value="">Select country…</option><option value="PH">Philippines</option><option value="US">United States</option></select></label>
          <label className="grid gap-1.5 text-sm font-semibold">Entity type<select key={country} name="entityType" className="workspace-field" required defaultValue={profile.country === country ? profile.entityType ?? '' : ''}><option value="">Select entity type…</option>{Object.entries(entityLabels).filter(([key]) => key !== 'LLC' || country === 'US').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {country === 'US' && <label className="grid gap-1.5 text-sm font-semibold">Business state or DC<input name="region" className="workspace-field uppercase" maxLength={2} minLength={2} placeholder="e.g. CA" defaultValue={profile.region ?? ''} required /><span className="text-xs font-normal text-slate-600">Two-letter state abbreviation. Sales-tax registrations are confirmed separately below.</span></label>}
          <label className="grid gap-1.5 text-sm font-semibold">Base currency<select className="workspace-field" value={currency} disabled={profile.currencyLocked} onChange={event => setCurrency(event.target.value as 'PHP' | 'USD')}><option value="PHP">PHP · Philippine peso</option><option value="USD">USD · US dollar</option></select><span className="text-xs font-normal text-slate-600">{profile.currencyLocked ? 'Existing financial records fix the currency. Amounts are never relabeled or converted.' : 'Confirm the currency of the books. Each workspace uses one currency.'}</span></label>
          <label className="grid gap-1.5 text-sm font-semibold">Fiscal year starts<select name="fiscalYearStartMonth" className="workspace-field" defaultValue={profile.fiscalYearStartMonth}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, index, 1)))}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm font-semibold">Books starting date<input type="date" name="booksStartDate" className="workspace-field" defaultValue={profile.booksStartDate?.slice(0, 10) ?? localDay()} readOnly={profile.currencyLocked && Boolean(profile.booksStartDate)} required /><span className="text-xs font-normal text-slate-600">Opening balances are dated the day before this. For existing books, choose a date on or before the first posted entry.</span></label>
          <div className="text-sm"><p className="font-semibold">Accounting basis</p><p className="mt-2">Accrual</p><p className="mt-1 text-xs text-slate-600">Invoices and bills are recognized when posted. Cash-basis reporting is not available in this release.</p></div>
        </div>
      </WorkspacePanel>
      {country && <WorkspacePanel title={country === 'PH' ? 'Philippine registration profile' : 'United States registration profile'} description="Record the business’s confirmed registrations. Country alone does not determine tax obligations.">
        <div key={country} className="grid gap-4 p-4 text-sm sm:p-5">
          {country === 'PH' ? <>
            <label className="grid max-w-md gap-1.5 font-semibold">VAT registration<select className="workspace-field" name="vatStatus" defaultValue={profile.taxSettings?.vatStatus ?? 'NOT_CONFIRMED'} required><option value="NOT_CONFIRMED">Not yet confirmed</option><option value="VAT">VAT registered</option><option value="NON_VAT">Non-VAT</option></select></label>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="withholdingAgent" defaultChecked={profile.taxSettings?.withholdingAgent ?? false} />The business is a registered withholding agent.</label>
          </> : <>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={registered} onChange={event => setRegistered(event.target.checked)} />The business has sales-tax registrations.</label>
            {registered && <label className="grid gap-1.5 font-semibold">Registered sales-tax jurisdictions<textarea name="salesTaxJurisdictions" className="workspace-field min-h-24" maxLength={500} defaultValue={profile.taxSettings?.salesTaxJurisdictions ?? ''} placeholder="List the states and local jurisdictions confirmed by the business or its tax adviser." required /></label>}
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="contractorTracking" defaultChecked={profile.taxSettings?.contractorTracking ?? false} />Track contractor reporting requirements for this business.</label>
          </>}
          <p className="border-t border-slate-200 pt-3 text-slate-600">This profile records registration details. Automated VAT, withholding, sales-tax calculations and tax filing are separate workflows; the saved profile does not calculate or file tax.</p>
        </div>
      </WorkspacePanel>}
      {emptyChart && <label className="flex items-start gap-3 border-y border-slate-300 py-4 text-sm"><input type="checkbox" name="createChart" className="mt-1" defaultChecked /><span><strong>Start with a basic service-business chart of accounts.</strong><span className="mt-1 block text-slate-600">Includes bank, cash, receivables, payables, equity, revenue and expense accounts. Review the chart before posting.</span></span></label>}
    </fieldset>
    {!canEdit && <p className="text-sm text-slate-600">Ask an owner or admin to update this client’s setup.</p>}
    {error && <WorkspaceNotice title="Setup could not save">{error}</WorkspaceNotice>}
    <div className="flex flex-wrap justify-between gap-3"><Link href="/settings" className="workspace-button">Back to settings</Link>{canEdit && <button type="submit" className="workspace-primary" disabled={busy || !country}>{busy ? 'Saving setup…' : profile.openingEligible ? 'Save and review opening balances' : 'Save workspace setup'}</button>}</div>
  </form>;
}
export default function WorkspaceSetupPage() {
  const load = useCallback(async () => { const [profile, accounts] = await Promise.all([getWorkspaceProfile(), getAccounts()]); return { profile, emptyChart: !accounts.length }; }, []);
  const state = useWorkspaceData(load);
  return <div className="workspace-page"><div className="workspace-content space-y-5"><WorkspaceHeading section="Settings" title="Set up this client’s books" description="Confirm the business profile, then establish a supported starting point for the ledger." />
    <nav className="mb-6 flex flex-wrap gap-3 text-sm" aria-label="Books setup"><span aria-current="step" className="font-semibold text-blue-800">1. Business profile</span><span className="text-slate-600">2. Opening balances</span><span className="text-slate-600">3. Review and post</span></nav>
    {state.loading && <p role="status">Loading workspace setup…</p>}{state.error && <WorkspaceNotice title="Workspace setup could not load" onRetry={state.retry} />}
    {state.data && <SetupForm key={state.data.profile.id} {...state.data} />}
  </div></div>;
}
