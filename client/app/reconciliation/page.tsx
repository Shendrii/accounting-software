'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, BookOpenCheck, Landmark, Upload, CheckCircle, Loader2, Plus, Trash2, FileSpreadsheet } from 'lucide-react';
import {
  getAccounts, getReconciliationData, importBankTransactions, importCSVTransactions, matchTransaction,
  completeReconciliation, getBankMatchSuggestions,
  type Account, type BankMatchSuggestion, type ReconciliationData,
} from '@/lib/api';
import { toast } from '@/lib/toast';
import { WorkspaceHeading, WorkspaceMetric, WorkspaceNotice, WorkspacePanel, WorkspaceRow } from '@/app/components/WorkspaceUI';
import { decimalText, decimalUnits, localDay } from '@/lib/money';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface ImportRow {
  date: string;
  description: string;
  amount: string;
}

export function ReconciliationPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(localDay);
  const [statementBalance, setStatementBalance] = useState('');
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [suggestions, setSuggestions] = useState<BankMatchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([{ date: '', description: '', amount: '' }]);
  const [importing, setImporting] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAccounts().then((accs) =>
      setAccounts(accs.filter((a) => a.isActive && a.type === 'ASSET'))
    ).catch(() => setError('Bank accounts could not load.'));
  }, []);

  async function proceed() {
    if (!selectedAccountId || !statementDate || !statementBalance) {
      setError('Enter the bank account, statement date, and ending balance.');
      return;
    }
    if (!/^-?(?:\d+|\d*\.\d{1,2})$/.test(statementBalance)) {
      setError('Enter a statement ending balance with up to two decimal places.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rec, suggestionData] = await Promise.all([
        getReconciliationData(selectedAccountId),
        getBankMatchSuggestions(selectedAccountId),
      ]);
      setData(rec);
      setSuggestions(suggestionData.suggestions);
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  }

  async function refreshTransactions() {
    const [transactions, matches] = await Promise.all([
      getReconciliationData(selectedAccountId), getBankMatchSuggestions(selectedAccountId),
    ]);
    setData(transactions);
    setSuggestions(matches.suggestions);
  }

  async function handleMatch() {
    if (!selectedBank || !selectedLine || matching) return;
    setMatching(true);
    setError(null);
    try {
      await matchTransaction(selectedBank, selectedLine);
      setSelectedBank(null);
      setSelectedLine(null);
      toast.success('Bank transaction matched');
      await refreshTransactions().catch(() => {
        setStep(1);
        setData(null);
        setError('The match was recorded. Open reconciliation again to reload transactions.');
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to match transaction');
    } finally {
      setMatching(false);
    }
  }

  async function handleComplete() {
    if (!selectedAccountId || !statementDate || !statementBalance) return;
    setCompleting(true);
    try {
      await completeReconciliation(selectedAccountId, statementDate, parseFloat(statementBalance));
      toast.success('Reconciliation completed successfully!');
      setStep(1);
      setData(null);
      setSelectedBank(null);
      setSelectedLine(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to complete reconciliation');
    } finally {
      setCompleting(false);
    }
  }

  async function handleImport() {
    const valid = importRows.filter((r) => r.date && r.description && r.amount);
    if (valid.length === 0) { setError('Add at least one valid transaction'); return; }
    setImporting(true);
    try {
      await importBankTransactions(selectedAccountId, valid.map((r) => ({
        date: r.date,
        description: r.description,
        amount: parseFloat(r.amount),
      })));
      setImportOpen(false);
      setImportRows([{ date: '', description: '', amount: '' }]);
      await refreshTransactions();
      toast.success(`${valid.length} transaction${valid.length !== 1 ? 's' : ''} imported`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to import transactions');
    } finally {
      setImporting(false);
    }
  }

  async function handleCsvImport() {
    if (!csvFile || !selectedAccountId) return;
    setCsvImporting(true);
    setError(null);
    try {
      const result = await importCSVTransactions(selectedAccountId, csvFile);
      setCsvModalOpen(false);
      setCsvFile(null);
      await refreshTransactions();
      toast.success(
        `Imported ${result.imported} transaction${result.imported !== 1 ? 's' : ''}${result.suggestions > 0 ? `, auto-matched ${result.suggestions}` : ''}`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to import CSV');
    } finally {
      setCsvImporting(false);
    }
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const bookBalance = decimalUnits(selectedAccount?.balance ?? '0');
  const stmtBal = decimalUnits(statementBalance);
  const difference = stmtBal - bookBalance;
  const canComplete = difference === BigInt(0) && data !== null;
  const bank = data?.bankTransactions.find(transaction => transaction.id === selectedBank);
  const journal = data?.journalLines.find(line => line.id === selectedLine);
  const candidates = suggestions.find(suggestion => suggestion.bankTransactionId === selectedBank)?.candidates ?? [];

  return (
    <div className="workspace-page">
      <div className="workspace-content">
        <div className="mb-5">
          <WorkspaceHeading section="Daily work" title={step === 1 ? 'Reconciliation setup' : 'Banking'}
            description={step === 1 ? 'Choose the bank account and statement you want to reconcile.' : 'Compare bank statement lines with posted journal entries.'}
            actions={step === 2 ? <>
              <button type="button" className="workspace-primary" onClick={() => setCsvModalOpen(true)}><FileSpreadsheet className="size-4" aria-hidden="true" />Import CSV</button>
              <button type="button" className="workspace-button" disabled={matching || completing} onClick={() => {
                setStep(1); setData(null); setSelectedBank(null); setSelectedLine(null); setError(null);
              }}>Reconciliation setup</button>
            </> : undefined} />
        </div>

        {error && <div className="mb-5"><WorkspaceNotice title="Reconciliation needs attention">{error}</WorkspaceNotice></div>}

        {/* Step 1 */}
        {step === 1 && (
          <div className="workspace-panel max-w-2xl p-4 sm:p-5">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-5">Statement details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="reconciliation-account">Bank account</label>
                <select
                  id="reconciliation-account"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="reconciliation-date">Statement ending date</label>
                <input
                  type="date"
                  id="reconciliation-date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="reconciliation-balance">Statement ending balance</label>
                <input
                  type="number"
                  step="0.01"
                  id="reconciliation-balance"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={proceed}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Start Reconciliation
              </button>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && data && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <WorkspaceMetric label="Book balance" value={formatCurrency(decimalText(bookBalance))} detail={selectedAccount?.name ?? 'Bank account'} icon={BookOpenCheck} />
              <WorkspaceMetric label="Statement ending" value={formatCurrency(decimalText(stmtBal))} detail={statementDate} icon={Landmark} />
              <WorkspaceMetric label="Difference" value={formatCurrency(decimalText(difference))} detail={canComplete ? 'Balances agree' : 'Review the difference'} icon={ArrowLeftRight} />
            </div>

            <div className="mb-5 grid items-start gap-4 xl:grid-cols-[1.15fr_1fr]">
              <WorkspacePanel title="Bank transactions" description={data.bankTransactions.length + ' unmatched'}>
                {data.bankTransactions.length ? (
                  <div className="workspace-table-wrap">
                    <table className="workspace-table">
                      <thead><tr><th scope="col">Transaction</th><th scope="col">Date</th><th scope="col" className="workspace-number">Amount</th></tr></thead>
                      <tbody>{data.bankTransactions.map(transaction => (
                        <tr key={transaction.id} className={transaction.id === selectedBank ? 'bg-blue-50' : undefined}>
                          <td><button type="button" aria-pressed={transaction.id === selectedBank} disabled={matching}
                            className="workspace-text-action px-0 text-left"
                            onClick={() => { setSelectedBank(transaction.id === selectedBank ? null : transaction.id); setSelectedLine(null); }}>
                            {transaction.description}
                          </button></td>
                          <td className="whitespace-nowrap">{formatDate(transaction.date)}</td>
                          <td className="workspace-number">{formatCurrency(transaction.amount)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="p-4 text-sm text-slate-600">No unmatched bank transactions.</p>}
              </WorkspacePanel>

              <WorkspacePanel title="Match review" description={bank ? bank.description + ' · ' + formatDate(bank.date) : 'Select a bank transaction to review matching entries.'}>
                {bank && (
                  <div className="divide-y divide-slate-200">
                    <WorkspaceRow icon={Landmark} title="Statement line" detail={formatCurrency(bank.amount)} />
                    {candidates.length > 0 && <div className="space-y-2 p-4 sm:px-5">
                      <h3 className="text-sm font-semibold">Suggested journal lines</h3>
                      {candidates.map(candidate => (
                        <button key={candidate.journalLineId} type="button" disabled={matching} aria-pressed={selectedLine === candidate.journalLineId}
                          onClick={() => setSelectedLine(candidate.journalLineId)}
                          className={'block w-full rounded-lg border px-3 py-2 text-left text-sm ' + (selectedLine === candidate.journalLineId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-blue-50')}>
                          <strong>{candidate.source.label} · {candidate.description}</strong>
                          <span className="block text-xs text-slate-600">{formatCurrency(candidate.amount)} · {candidate.exactAmount ? 'Exact amount' : 'Near match'} · {Math.round(candidate.dateDistance)} days apart</span>
                        </button>
                      ))}
                    </div>}
                    <div className="space-y-2 p-4 sm:px-5">
                      <label htmlFor="reconciliation-journal" className="text-sm font-semibold">Journal line</label>
                      <select id="reconciliation-journal" className="workspace-field" disabled={matching || !data.journalLines.length}
                        value={selectedLine ?? ''} onChange={event => setSelectedLine(event.target.value || null)}>
                        <option value="">Select an unmatched journal line</option>
                        {data.journalLines.map(line => <option key={line.id} value={line.id}>
                          {line.journalEntry.description} · {formatDate(line.journalEntry.date)} · {formatCurrency(decimalText(decimalUnits(line.debit) - decimalUnits(line.credit)))}
                        </option>)}
                      </select>
                      {journal && <p className="text-xs text-slate-600">{journal.journalEntry.referenceNo || 'Posted journal line'} · {formatDate(journal.journalEntry.date)}</p>}
                      <button type="button" className="workspace-primary" onClick={handleMatch} disabled={!journal || matching}>
                        <CheckCircle className="size-4" aria-hidden="true" />{matching ? 'Matching…' : 'Confirm match'}
                      </button>
                    </div>
                  </div>
                )}
              </WorkspacePanel>
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" className="workspace-button" onClick={() => setImportOpen(true)}><Upload className="size-4" aria-hidden="true" />Enter transactions</button>
              <button type="button" className="workspace-primary" onClick={handleComplete} disabled={!canComplete || completing || matching}>
                {completing ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <CheckCircle className="size-4" aria-hidden="true" />}
                Complete reconciliation
              </button>
            </div>

            {/* Import Modal */}
            {importOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setImportOpen(false)} />
                <div className="relative bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Import Bank Transactions</h3>
                  <table className="w-full text-sm mb-4">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        <th className="text-left py-2 text-xs font-medium text-zinc-500">Date</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-zinc-500">Description</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-zinc-500">Amount (+/-)</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row, i) => (
                        <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                          <td className="py-1.5">
                            <input type="date" value={row.date} onChange={(e) => {
                              const r = [...importRows]; r[i].date = e.target.value; setImportRows(r);
                            }} className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input value={row.description} onChange={(e) => {
                              const r = [...importRows]; r[i].description = e.target.value; setImportRows(r);
                            }} placeholder="Description" className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" step="0.01" value={row.amount} onChange={(e) => {
                              const r = [...importRows]; r[i].amount = e.target.value; setImportRows(r);
                            }} placeholder="100.00" className="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none" />
                          </td>
                          <td className="py-1.5 pl-1">
                            {importRows.length > 1 && (
                              <button onClick={() => setImportRows(importRows.filter((_, j) => j !== i))} className="p-1 text-zinc-400 hover:text-red-500">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    onClick={() => setImportRows([...importRows, { date: '', description: '', amount: '' }])}
                    className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 mb-4"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add row
                  </button>
                  <div className="flex gap-3">
                    <button onClick={() => setImportOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium">
                      Cancel
                    </button>
                    <button onClick={handleImport} disabled={importing} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
                      {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                      Import
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* CSV Import Modal */}
        {csvModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCsvModalOpen(false)} />
            <div className="relative bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 w-full max-w-md mx-4">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Import CSV Bank Statement</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Upload a CSV exported from your bank. We auto-detect columns for date, description, and amount.
                After import, transactions are auto-matched to journal lines within ±3 days.
              </p>
              <div
                className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors mb-4"
                onClick={() => csvInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
                {csvFile ? (
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{csvFile.name}</p>
                ) : (
                  <p className="text-sm text-zinc-500">Click to select CSV file</p>
                )}
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                Accepted columns: <code>date</code>, <code>description</code> (or memo/narrative), <code>amount</code> (or separate debit/credit columns)
              </p>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setCsvModalOpen(false); setCsvFile(null); }} className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium">
                  Cancel
                </button>
                <button
                  onClick={handleCsvImport}
                  disabled={!csvFile || csvImporting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {csvImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Import CSV
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LegacyReconciliationPage() {
  return <LegacyRedirect to="/banking" />;
}
