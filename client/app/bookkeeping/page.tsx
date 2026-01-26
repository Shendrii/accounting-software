'use client';

import { useState, useEffect } from 'react';
import { getAccounts, getJournalEntries, type Account, type JournalEntry } from '@/lib/api';
import CreateAccountForm from '@/app/components/CreateAccountForm';
import EditAccountForm from '@/app/components/EditAccountForm';
import CreateJournalEntryForm from '@/app/components/CreateJournalEntryForm';
import { Plus, BookOpen, FileText, Edit2 } from 'lucide-react';

export default function BookkeepingPage() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'journal'>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCreateJournalForm, setShowCreateJournalForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'accounts') {
        const accountsData = await getAccounts();
        setAccounts(accountsData);
      } else {
        const entriesData = await getJournalEntries();
        setJournalEntries(entriesData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleAccountCreated = () => {
    setShowCreateForm(false);
    loadData();
  };

  return (
    <div className="lg:pl-64 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Bookkeeping
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Manage your accounts and journal entries
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'accounts'
                  ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Accounts
              </div>
            </button>
            <button
              onClick={() => setActiveTab('journal')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'journal'
                  ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Journal Entries
              </div>
            </button>
          </nav>
        </div>

        {/* Content */}
        {activeTab === 'accounts' ? (
          <div>
            {/* Accounts Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Accounts ({accounts.length})
              </h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                {showCreateForm ? 'Cancel' : 'New Account'}
              </button>
            </div>

            {/* Create Form */}
            {showCreateForm && (
              <div className="mb-8">
                <CreateAccountForm
                  onSuccess={() => {
                    setShowCreateForm(false);
                    loadData();
                  }}
                  onCancel={() => setShowCreateForm(false)}
                />
              </div>
            )}

            {/* Edit Form */}
            {editingAccount && (
              <div className="mb-8">
                <EditAccountForm
                  account={editingAccount}
                  onSuccess={() => {
                    setEditingAccount(null);
                    loadData();
                  }}
                  onCancel={() => setEditingAccount(null)}
                />
              </div>
            )}

            {/* Accounts List */}
            {loading ? (
              <div className="text-center py-12">
                <p className="text-zinc-600 dark:text-zinc-400">Loading accounts...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
              </div>
            ) : accounts.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                <BookOpen className="h-12 w-12 text-zinc-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-2">
                  No accounts yet
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                  Get started by creating your first account.
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Create Account
                </button>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Code
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Balance
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {accounts.map((account) => (
                        <tr
                          key={account.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {account.code}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-50">
                            {account.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                            {account.type}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-50">
                            ${parseFloat(account.balance).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                account.isActive
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                              }`}
                            >
                              {account.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => setEditingAccount(account)}
                              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Journal Entries Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Journal Entries ({journalEntries.length})
              </h2>
              <button
                onClick={() => setShowCreateJournalForm(!showCreateJournalForm)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                {showCreateJournalForm ? 'Cancel' : 'New Entry'}
              </button>
            </div>

            {/* Create Journal Entry Form */}
            {showCreateJournalForm && (
              <div className="mb-8">
                <CreateJournalEntryForm
                  onSuccess={() => {
                    setShowCreateJournalForm(false);
                    loadData();
                  }}
                  onCancel={() => setShowCreateJournalForm(false)}
                />
              </div>
            )}

            {/* Journal Entries List */}
            {loading ? (
              <div className="text-center py-12">
                <p className="text-zinc-600 dark:text-zinc-400">Loading journal entries...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
              </div>
            ) : journalEntries.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                <FileText className="h-12 w-12 text-zinc-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-2">
                  No journal entries yet
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Journal entry creation coming soon.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {journalEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                          {entry.description}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {new Date(entry.date).toLocaleDateString()} • {entry.referenceNo || 'No reference'}
                        </p>
                      </div>
                      <span
                        className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                          entry.status === 'POSTED'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                            : entry.status === 'DRAFT'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-900">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              Account
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              Debit
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              Credit
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {entry.journalLines.map((line) => (
                            <tr key={line.id}>
                              <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                                {line.account?.name || 'Unknown Account'}
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-900 dark:text-zinc-50">
                                {parseFloat(line.debit) > 0
                                  ? `$${parseFloat(line.debit).toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}`
                                  : '-'}
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-900 dark:text-zinc-50">
                                {parseFloat(line.credit) > 0
                                  ? `$${parseFloat(line.credit).toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}`
                                  : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
