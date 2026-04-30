'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Upload, CheckCircle, XCircle, Loader2, Plus, Trash2, FileSpreadsheet } from 'lucide-react';
import {
  getAccounts, getReconciliationData, importBankTransactions, importCSVTransactions, matchTransaction,
  unmatchTransaction, completeReconciliation,
  type Account, type BankTransaction, type ReconciliationData,
} from '@/lib/api';
import { toast } from '@/lib/toast';

type JournalLineWithEntry = ReconciliationData['journalLines'][number];

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

export default function ReconciliationPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split('T')[0]);
  const [statementBalance, setStatementBalance] = useState('');
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
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
    );
  }, []);

  async function proceed() {
    if (!selectedAccountId || !statementDate || !statementBalance) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rec = await getReconciliationData(selectedAccountId);
      setData(rec);
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  }

  async function handleMatch() {
    if (!selectedBank || !selectedLine) return;
    try {
      await matchTransaction(selectedBank, selectedLine);
      const rec = await getReconciliationData(selectedAccountId);
      setData(rec);
      setSelectedBank(null);
      setSelectedLine(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to match transaction');
    }
  }

  async function handleUnmatch(bankId: string) {
    try {
      await unmatchTransaction(bankId);
      const rec = await getReconciliationData(selectedAccountId);
      setData(rec);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to unmatch');
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
      const rec = await getReconciliationData(selectedAccountId);
      setData(rec);
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
      const rec = await getReconciliationData(selectedAccountId);
      setData(rec);
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
  const bookBalance = selectedAccount ? parseFloat(selectedAccount.balance.toString()) : 0;
  const stmtBal = parseFloat(statementBalance) || 0;
  const difference = stmtBal - bookBalance;
  const canComplete = Math.abs(difference) < 0.01 && data !== null;

  useEffect(() => {
    if (selectedBank && selectedLine) {
      handleMatch();
    }
  }, [selectedBank, selectedLine]);

  return (
    <div className="lg:pl-64 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <RefreshCw className="h-7 w-7 text-zinc-600 dark:text-zinc-400" />
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Bank Reconciliation</h1>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 max-w-lg">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-5">Set Up Reconciliation</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Bank Account *</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Statement Ending Date *</label>
                <input
                  type="date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Statement Ending Balance *</label>
                <input
                  type="number"
                  step="0.01"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </div>
              <button
                onClick={proceed}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
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
            {/* Summary Bar */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Book Balance', value: formatCurrency(bookBalance), color: 'text-zinc-900 dark:text-zinc-50' },
                { label: 'Statement Balance', value: formatCurrency(stmtBal), color: 'text-blue-600 dark:text-blue-400' },
                { label: 'Difference', value: formatCurrency(difference), color: Math.abs(difference) < 0.01 ? 'text-emerald-600' : 'text-red-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                  <p className="text-xs text-zinc-500 mb-1">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-5">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Click a bank transaction, then a journal line to match them.
              </p>
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <Upload className="h-4 w-4" />
                Import Transactions
              </button>
              <button
                onClick={() => setCsvModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Import CSV
              </button>
              <button
                onClick={handleComplete}
                disabled={!canComplete || completing}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-emerald-700"
              >
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Complete Reconciliation
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bank Transactions */}
              <div>
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                  Bank Transactions ({data.bankTransactions.length} unmatched)
                </h2>
                <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  {data.bankTransactions.length === 0 ? (
                    <p className="text-sm text-zinc-400 p-4">No unmatched bank transactions.</p>
                  ) : (
                    data.bankTransactions.map((bt: BankTransaction) => (
                      <div
                        key={bt.id}
                        onClick={() => setSelectedBank(selectedBank === bt.id ? null : bt.id)}
                        className={`flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 cursor-pointer transition-colors ${
                          selectedBank === bt.id
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{bt.description}</p>
                          <p className="text-xs text-zinc-400">{formatDate(bt.date)}</p>
                        </div>
                        <span className={`text-sm font-bold ${parseFloat(bt.amount.toString()) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(bt.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Journal Lines */}
              <div>
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                  Journal Lines ({data.journalLines.length} unmatched)
                </h2>
                <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  {data.journalLines.length === 0 ? (
                    <p className="text-sm text-zinc-400 p-4">No unmatched journal lines.</p>
                  ) : (
                    data.journalLines.map((jl: JournalLineWithEntry) => {
                      const netAmt = parseFloat(jl.debit.toString()) - parseFloat(jl.credit.toString());
                      return (
                        <div
                          key={jl.id}
                          onClick={() => setSelectedLine(selectedLine === jl.id ? null : jl.id)}
                          className={`flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 cursor-pointer transition-colors ${
                            selectedLine === jl.id
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{jl.journalEntry.description}</p>
                            <p className="text-xs text-zinc-400">
                              {formatDate(jl.journalEntry.date)}
                              {jl.journalEntry.referenceNo && ` · ${jl.journalEntry.referenceNo}`}
                            </p>
                          </div>
                          <span className={`text-sm font-bold ${netAmt >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(Math.abs(netAmt))}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
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
                    <button onClick={handleImport} disabled={importing} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50">
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
