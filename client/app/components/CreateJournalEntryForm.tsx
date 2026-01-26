'use client';

import { useState, useEffect } from 'react';
import { createJournalEntry, getAccounts, type Account, type CreateJournalEntryInput } from '@/lib/api';
import { Plus, X, Trash2 } from 'lucide-react';

interface CreateJournalEntryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface JournalLineForm {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

export default function CreateJournalEntryForm({ onSuccess, onCancel }: CreateJournalEntryFormProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    referenceNo: '',
  });
  const [journalLines, setJournalLines] = useState<JournalLineForm[]>([
    { accountId: '', debit: '', credit: '', description: '' },
    { accountId: '', debit: '', credit: '', description: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const accountsData = await getAccounts();
      setAccounts(accountsData.filter(a => a.isActive));
    } catch (err) {
      setError('Failed to load accounts');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const addJournalLine = () => {
    setJournalLines([...journalLines, { accountId: '', debit: '', credit: '', description: '' }]);
  };

  const removeJournalLine = (index: number) => {
    setJournalLines(journalLines.filter((_, i) => i !== index));
  };

  const updateJournalLine = (index: number, field: keyof JournalLineForm, value: string) => {
    const updated = [...journalLines];
    updated[index] = { ...updated[index], [field]: value };
    
    // If debit is entered, clear credit and vice versa
    if (field === 'debit' && value) {
      updated[index].credit = '';
    } else if (field === 'credit' && value) {
      updated[index].debit = '';
    }
    
    setJournalLines(updated);
  };

  const calculateTotals = () => {
    const totalDebits = journalLines.reduce((sum, line) => sum + parseFloat(line.debit || '0'), 0);
    const totalCredits = journalLines.reduce((sum, line) => sum + parseFloat(line.credit || '0'), 0);
    return { totalDebits, totalCredits, difference: Math.abs(totalDebits - totalCredits) };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (!formData.description.trim()) {
      setError('Description is required');
      setLoading(false);
      return;
    }

    const validLines = journalLines.filter(
      line => line.accountId && (line.debit || line.credit)
    );

    if (validLines.length < 2) {
      setError('At least 2 journal lines are required');
      setLoading(false);
      return;
    }

    const { totalDebits, totalCredits } = calculateTotals();
    if (totalDebits !== totalCredits) {
      setError(`Debits (${totalDebits.toFixed(2)}) must equal credits (${totalCredits.toFixed(2)})`);
      setLoading(false);
      return;
    }

    try {
      const entryData: CreateJournalEntryInput = {
        date: formData.date,
        description: formData.description,
        referenceNo: formData.referenceNo || undefined,
        journalLines: validLines.map(line => ({
          accountId: line.accountId,
          debit: parseFloat(line.debit || '0'),
          credit: parseFloat(line.credit || '0'),
          description: line.description || undefined,
        })),
      };

      await createJournalEntry(entryData);
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        description: '',
        referenceNo: '',
      });
      setJournalLines([
        { accountId: '', debit: '', credit: '', description: '' },
        { accountId: '', debit: '', credit: '', description: '' },
      ]);
      
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create journal entry');
    } finally {
      setLoading(false);
    }
  };

  const { totalDebits, totalCredits, difference } = calculateTotals();
  const isBalanced = totalDebits === totalCredits && totalDebits > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Create Journal Entry</h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      {loadingAccounts ? (
        <p className="text-zinc-600 dark:text-zinc-400">Loading accounts...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
                Date *
              </label>
              <input
                type="date"
                id="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label htmlFor="referenceNo" className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
                Reference Number
              </label>
              <input
                type="text"
                id="referenceNo"
                value={formData.referenceNo}
                onChange={(e) => setFormData({ ...formData, referenceNo: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                placeholder="JE-001"
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">
              Description *
            </label>
            <input
              type="text"
              id="description"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              placeholder="e.g., Initial capital investment"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Journal Lines *
              </label>
              <button
                type="button"
                onClick={addJournalLine}
                className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                <Plus className="h-4 w-4" />
                Add Line
              </button>
            </div>

            <div className="space-y-3">
              {journalLines.map((line, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-start p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg">
                  <div className="col-span-4">
                    <select
                      value={line.accountId}
                      onChange={(e) => updateJournalLine(index, 'accountId', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      required={index < 2}
                    >
                      <option value="">Select account</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.debit}
                      onChange={(e) => updateJournalLine(index, 'debit', e.target.value)}
                      placeholder="Debit"
                      className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      disabled={!!line.credit}
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.credit}
                      onChange={(e) => updateJournalLine(index, 'credit', e.target.value)}
                      placeholder="Credit"
                      className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      disabled={!!line.debit}
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateJournalLine(index, 'description', e.target.value)}
                      placeholder="Description"
                      className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                  <div className="col-span-1">
                    {journalLines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeJournalLine(index)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Total Debits:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  ${totalDebits.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-zinc-600 dark:text-zinc-400">Total Credits:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  ${totalCredits.toFixed(2)}
                </span>
              </div>
              {!isBalanced && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-red-600 dark:text-red-400">Difference:</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    ${difference.toFixed(2)}
                  </span>
                </div>
              )}
              {isBalanced && (
                <div className="mt-2 text-sm text-green-600 dark:text-green-400 font-medium">
                  ✓ Balanced
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !isBalanced}
              className="flex-1 px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Creating...' : 'Create Entry'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
