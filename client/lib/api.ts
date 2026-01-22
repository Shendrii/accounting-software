/**
 * API Client for Bookkeeping System
 * 
 * This file provides functions to interact with the backend API.
 * All functions return Promises that resolve to the API response.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper function to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  
  // Handle 204 No Content responses
  if (response.status === 204) {
    return null as T;
  }
  
  return response.json();
}

// ==================== ACCOUNTS API ====================

export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balance: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  description?: string;
  isActive?: boolean;
}

export interface UpdateAccountInput {
  code?: string;
  name?: string;
  type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  description?: string;
  isActive?: boolean;
}

/**
 * Get all accounts
 */
export async function getAccounts(): Promise<Account[]> {
  const response = await fetch(`${API_URL}/api/accounts`);
  return handleResponse<Account[]>(response);
}

/**
 * Get a single account by ID
 */
export async function getAccount(id: string): Promise<Account> {
  const response = await fetch(`${API_URL}/api/accounts/${id}`);
  return handleResponse<Account>(response);
}

/**
 * Create a new account
 */
export async function createAccount(data: CreateAccountInput): Promise<Account> {
  const response = await fetch(`${API_URL}/api/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Account>(response);
}

/**
 * Update an existing account
 */
export async function updateAccount(id: string, data: UpdateAccountInput): Promise<Account> {
  const response = await fetch(`${API_URL}/api/accounts/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Account>(response);
}

/**
 * Delete an account
 */
export async function deleteAccount(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/accounts/${id}`, {
    method: 'DELETE',
  });
  return handleResponse<void>(response);
}

// ==================== JOURNAL ENTRIES API ====================

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: string;
  credit: string;
  description?: string | null;
  createdAt: string;
  account?: Account;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  referenceNo?: string | null;
  status: 'DRAFT' | 'POSTED' | 'ARCHIVED';
  journalLines: JournalLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateJournalLineInput {
  accountId: string;
  debit: number | string;
  credit: number | string;
  description?: string;
}

export interface CreateJournalEntryInput {
  date: string; // ISO date string (YYYY-MM-DD)
  description: string;
  referenceNo?: string;
  journalLines: CreateJournalLineInput[];
}

export interface UpdateJournalEntryInput {
  date?: string;
  description?: string;
  referenceNo?: string;
  status?: 'DRAFT' | 'POSTED' | 'ARCHIVED';
  journalLines?: CreateJournalLineInput[];
}

export interface JournalEntryFilters {
  status?: 'DRAFT' | 'POSTED' | 'ARCHIVED';
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}

/**
 * Get all journal entries with optional filters
 */
export async function getJournalEntries(filters?: JournalEntryFilters): Promise<JournalEntry[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  
  const queryString = params.toString();
  const url = `${API_URL}/api/journal-entries${queryString ? `?${queryString}` : ''}`;
  
  const response = await fetch(url);
  return handleResponse<JournalEntry[]>(response);
}

/**
 * Get a single journal entry by ID
 */
export async function getJournalEntry(id: string): Promise<JournalEntry> {
  const response = await fetch(`${API_URL}/api/journal-entries/${id}`);
  return handleResponse<JournalEntry>(response);
}

/**
 * Create a new journal entry
 * 
 * @example
 * ```typescript
 * await createJournalEntry({
 *   date: '2024-12-03',
 *   description: 'Initial capital investment',
 *   journalLines: [
 *     { accountId: 'acc1', debit: 10000, credit: 0 },
 *     { accountId: 'acc2', debit: 0, credit: 10000 }
 *   ]
 * });
 * ```
 */
export async function createJournalEntry(data: CreateJournalEntryInput): Promise<JournalEntry> {
  const response = await fetch(`${API_URL}/api/journal-entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<JournalEntry>(response);
}

/**
 * Update a journal entry
 * Note: Cannot modify journal lines if status is POSTED
 */
export async function updateJournalEntry(
  id: string,
  data: UpdateJournalEntryInput
): Promise<JournalEntry> {
  const response = await fetch(`${API_URL}/api/journal-entries/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<JournalEntry>(response);
}

/**
 * Post a journal entry (change status from DRAFT to POSTED)
 * This will also update account balances
 */
export async function postJournalEntry(id: string): Promise<JournalEntry> {
  const response = await fetch(`${API_URL}/api/journal-entries/${id}/post`, {
    method: 'POST',
  });
  return handleResponse<JournalEntry>(response);
}

/**
 * Delete a journal entry
 * Note: Cannot delete if status is POSTED
 */
export async function deleteJournalEntry(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/journal-entries/${id}`, {
    method: 'DELETE',
  });
  return handleResponse<void>(response);
}

