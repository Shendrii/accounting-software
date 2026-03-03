'use client';

import React, { useState, useEffect } from 'react';
import { getAccounts, getJournalEntries, type Account, type JournalEntry } from '@/lib/api';
import CreateAccountForm from '@/app/components/CreateAccountForm';
import EditAccountForm from '@/app/components/EditAccountForm';
import CreateJournalEntryForm from '@/app/components/CreateJournalEntryForm';
import EditJournalEntryForm from '@/app/components/EditJournalEntryForm';
import { Plus, BookOpen, FileText, Edit2, Search, Filter, X, ChevronRight, ChevronDown, DollarSign, Calendar, Hash } from 'lucide-react';

export default function BookkeepingPage() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'journal'>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCreateJournalForm, setShowCreateJournalForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingJournalEntry, setEditingJournalEntry] = useState<JournalEntry | null>(null);
  
  // Account filters
  const [accountSearch, setAccountSearch] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState<string>('all');
  const [expandedAccountTypes, setExpandedAccountTypes] = useState<Set<string>>(new Set(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']));
  
  // Journal entry filters
  const [journalSearch, setJournalSearch] = useState('');
  const [journalStatusFilter, setJournalStatusFilter] = useState<string>('all');
  const [journalStartDate, setJournalStartDate] = useState('');
  const [journalEndDate, setJournalEndDate] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsData, entriesData] = await Promise.all([
        getAccounts(),
        getJournalEntries()
      ]);
      setAccounts(accountsData);
      setJournalEntries(entriesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Group accounts by type
  const accountsByType = accounts.reduce((acc, account) => {
    if (!acc[account.type]) {
      acc[account.type] = [];
    }
    acc[account.type].push(account);
    return acc;
  }, {} as Record<string, Account[]>);

  // Filter accounts
  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch = 
      accountSearch === '' ||
      account.name.toLowerCase().includes(accountSearch.toLowerCase()) ||
      account.code.toLowerCase().includes(accountSearch.toLowerCase()) ||
      (account.description || '').toLowerCase().includes(accountSearch.toLowerCase());
    
    const matchesType = accountTypeFilter === 'all' || account.type === accountTypeFilter;
    
    const matchesStatus = accountStatusFilter === 'all' || 
      (accountStatusFilter === 'active' && account.isActive) ||
      (accountStatusFilter === 'inactive' && !account.isActive);
    
    return matchesSearch && matchesType && matchesStatus;
  });

  // Filter journal entries
  const filteredJournalEntries = journalEntries.filter((entry) => {
    const matchesSearch = 
      journalSearch === '' ||
      entry.description.toLowerCase().includes(journalSearch.toLowerCase()) ||
      (entry.referenceNo || '').toLowerCase().includes(journalSearch.toLowerCase());
    
    const matchesStatus = journalStatusFilter === 'all' || entry.status === journalStatusFilter;
    
    const entryDate = new Date(entry.date);
    const matchesStartDate = !journalStartDate || entryDate >= new Date(journalStartDate);
    const matchesEndDate = !journalEndDate || entryDate <= new Date(journalEndDate);
    
    return matchesSearch && matchesStatus && matchesStartDate && matchesEndDate;
  });

  const clearAccountFilters = () => {
    setAccountSearch('');
    setAccountTypeFilter('all');
    setAccountStatusFilter('all');
  };

  const clearJournalFilters = () => {
    setJournalSearch('');
    setJournalStatusFilter('all');
    setJournalStartDate('');
    setJournalEndDate('');
  };

  const toggleAccountType = (type: string) => {
    const newExpanded = new Set(expandedAccountTypes);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedAccountTypes(newExpanded);
  };

  const getAccountTypeTotal = (type: string) => {
    return accountsByType[type]?.reduce((sum, acc) => sum + parseFloat(acc.balance), 0) || 0;
  };

  const accountTypeLabels: Record<string, string> = {
    ASSET: 'Assets',
    LIABILITY: 'Liabilities',
    EQUITY: 'Equity',
    REVENUE: 'Revenue',
    EXPENSE: 'Expenses',
  };

  return (
    <div className="lg:pl-64 min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Bookkeeping
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Manage your chart of accounts and record journal entries
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
                Chart of Accounts
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
          <div className="space-y-6">
            {/* Accounts Header */}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Chart of Accounts
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  {filteredAccounts.length} {filteredAccounts.length === 1 ? 'account' : 'accounts'}
                  {filteredAccounts.length !== accounts.length && ` of ${accounts.length} total`}
                </p>
              </div>
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
              <div className="mb-6">
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
              <div className="mb-6">
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

            {/* Filters */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search accounts by name, code, or description..."
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
                    />
                  </div>
                </div>
                <div className="w-full md:w-48">
                  <select
                    value={accountTypeFilter}
                    onChange={(e) => setAccountTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
                  >
                    <option value="all">All Types</option>
                    <option value="ASSET">Assets</option>
                    <option value="LIABILITY">Liabilities</option>
                    <option value="EQUITY">Equity</option>
                    <option value="REVENUE">Revenue</option>
                    <option value="EXPENSE">Expenses</option>
                  </select>
                </div>
                <div className="w-full md:w-40">
                  <select
                    value={accountStatusFilter}
                    onChange={(e) => setAccountStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                {(accountSearch || accountTypeFilter !== 'all' || accountStatusFilter !== 'all') && (
                  <button
                    onClick={clearAccountFilters}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Accounts List - Chart of Accounts Style */}
            {loading ? (
              <div className="text-center py-12">
                <p className="text-zinc-600 dark:text-zinc-400">Loading accounts...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                <BookOpen className="h-12 w-12 text-zinc-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-2">
                  {accounts.length === 0 ? 'No accounts yet' : 'No accounts match your filters'}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                  {accounts.length === 0 
                    ? 'Get started by creating your first account.'
                    : 'Try adjusting your search or filter criteria.'}
                </p>
                {accounts.length === 0 && (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors text-sm font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Create Account
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                {/* Chart of Accounts Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Account
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
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
                      {accountTypeFilter === 'all' ? (
                        // Grouped by type view
                        Object.entries(accountsByType).map(([type, typeAccounts]) => {
                          const filteredTypeAccounts = typeAccounts.filter(acc => 
                            filteredAccounts.some(fa => fa.id === acc.id)
                          );
                          if (filteredTypeAccounts.length === 0) return null;
                          
                          const isExpanded = expandedAccountTypes.has(type);
                          const total = getAccountTypeTotal(type);
                          
                          return (
                            <React.Fragment key={type}>
                              {/* Type Header Row */}
                              <tr className="bg-zinc-50 dark:bg-zinc-900/50 font-semibold">
                                <td className="px-6 py-3">
                                  <button
                                    onClick={() => toggleAccountType(type)}
                                    className="flex items-center gap-2 text-zinc-900 dark:text-zinc-50 hover:text-zinc-600 dark:hover:text-zinc-400"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                    <span>{accountTypeLabels[type]}</span>
                                    <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                      ({filteredTypeAccounts.length})
                                    </span>
                                  </button>
                                </td>
                                <td className="px-6 py-3 text-zinc-600 dark:text-zinc-400 text-sm">
                                  {type}
                                </td>
                                <td className="px-6 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
                                  ${total.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="px-6 py-3"></td>
                                <td className="px-6 py-3"></td>
                              </tr>
                              {/* Account Rows */}
                              {isExpanded && filteredTypeAccounts.map((account) => (
                                <tr
                                  key={account.id}
                                  className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                                >
                                  <td className="px-6 py-4 pl-12">
                                    <div className="flex items-center gap-2">
                                      <Hash className="h-3 w-3 text-zinc-400" />
                                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                        {account.code}
                                      </span>
                                      <span className="text-sm text-zinc-900 dark:text-zinc-50">
                                        {account.name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400">
                                    {account.type}
                                  </td>
                                  <td className="px-6 py-4 text-right text-sm text-zinc-900 dark:text-zinc-50">
                                    ${parseFloat(account.balance).toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td className="px-6 py-4">
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
                                  <td className="px-6 py-4 text-right">
                                    <button
                                      onClick={() => setEditingAccount(account)}
                                      className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })
                      ) : (
                        // Flat list when filtered by type
                        filteredAccounts.map((account) => (
                          <tr
                            key={account.id}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Hash className="h-3 w-3 text-zinc-400" />
                                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                  {account.code}
                                </span>
                                <span className="text-sm text-zinc-900 dark:text-zinc-50">
                                  {account.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400">
                              {account.type}
                            </td>
                            <td className="px-6 py-4 text-right text-sm text-zinc-900 dark:text-zinc-50">
                              ${parseFloat(account.balance).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-6 py-4">
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
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => setEditingAccount(account)}
                                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Journal Entries Header */}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Journal Entries
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  {filteredJournalEntries.length} {filteredJournalEntries.length === 1 ? 'entry' : 'entries'}
                  {filteredJournalEntries.length !== journalEntries.length && ` of ${journalEntries.length} total`}
                </p>
              </div>
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
              <div className="mb-6">
                <CreateJournalEntryForm
                  onSuccess={() => {
                    setShowCreateJournalForm(false);
                    loadData();
                  }}
                  onCancel={() => setShowCreateJournalForm(false)}
                />
              </div>
            )}

            {/* Edit Journal Entry Form */}
            {editingJournalEntry && (
              <div className="mb-6">
                <EditJournalEntryForm
                  entry={editingJournalEntry}
                  onSuccess={() => {
                    setEditingJournalEntry(null);
                    loadData();
                  }}
                  onCancel={() => setEditingJournalEntry(null)}
                />
              </div>
            )}

            {/* Filters */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search by description or reference number..."
                        value={journalSearch}
                        onChange={(e) => setJournalSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
                      />
                    </div>
                  </div>
                  <div className="w-full md:w-48">
                    <select
                      value={journalStatusFilter}
                      onChange={(e) => setJournalStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
                    >
                      <option value="ALL">All Status</option>
                      <option value="DRAFT">Draft</option>
                      <option value="POSTED">Posted</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={journalStartDate}
                      onChange={(e) => setJournalStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={journalEndDate}
                      onChange={(e) => setJournalEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-sm"
                    />
                  </div>
                  {(journalSearch || journalStatusFilter !== 'all' || journalStartDate || journalEndDate) && (
                    <div className="flex items-end">
                      <button
                        onClick={clearJournalFilters}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                      >
                        <X className="h-4 w-4" />
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Journal Entries List */}
            {loading ? (
              <div className="text-center py-12">
                <p className="text-zinc-600 dark:text-zinc-400">Loading journal entries...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
              </div>
            ) : filteredJournalEntries.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                <FileText className="h-12 w-12 text-zinc-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-2">
                  {journalEntries.length === 0 ? 'No journal entries yet' : 'No journal entries match your filters'}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {journalEntries.length === 0 
                    ? 'Get started by creating your first journal entry.'
                    : 'Try adjusting your search or filter criteria.'}
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Reference
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Accounts
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Total
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
                      {filteredJournalEntries.map((entry) => {
                        const totalDebit = entry.journalLines.reduce((sum, line) => sum + parseFloat(line.debit), 0);
                        const accountNames = entry.journalLines.map(line => line.account?.name || 'Unknown').join(', ');
                        return (
                          <tr
                            key={entry.id}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-50">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-zinc-400" />
                                {new Date(entry.date).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                              {entry.referenceNo || '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-900 dark:text-zinc-50">
                              {entry.description}
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400 max-w-xs truncate">
                              {accountNames}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-zinc-900 dark:text-zinc-50">
                              <div className="flex items-center justify-end gap-1">
                                <DollarSign className="h-3 w-3 text-zinc-400" />
                                {totalDebit.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
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
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <button
                                onClick={() => setEditingJournalEntry(entry)}
                                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                                title="Edit entry"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
