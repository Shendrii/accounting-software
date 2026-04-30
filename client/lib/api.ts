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

// ==================== RECEIPTS API ====================

export interface ReceiptLineItem {
  description: string;
  amount: number;
}

export interface ReceiptExtractedData {
  vendor?: string;
  date?: string;
  amount?: number;
  invoiceDate?: string;
  dueDate?: string;
  invoiceNumber?: string;
  total?: number;
  amountPaid?: number;
  balanceDue?: number;
  items?: ReceiptLineItem[];
  category?: string;
  confidence?: number;
  rawText?: string;
}

export interface Receipt {
  id: string;
  imageUrl: string;
  extractedData: ReceiptExtractedData;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  journalEntry?: JournalEntry | null;
}

export function getReceiptImageUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${API_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
}

export async function uploadReceipt(file: File): Promise<Receipt> {
  const formData = new FormData();
  formData.append('image', file);
  const response = await fetch(`${API_URL}/api/receipts/upload`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<Receipt>(response);
}

export async function getReceipts(status?: string): Promise<Receipt[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  const response = await fetch(`${API_URL}/api/receipts${params}`);
  return handleResponse<Receipt[]>(response);
}

export async function getReceipt(id: string): Promise<Receipt> {
  const response = await fetch(`${API_URL}/api/receipts/${id}`);
  return handleResponse<Receipt>(response);
}

export async function updateReceipt(
  id: string,
  data: { extractedData?: ReceiptExtractedData; status?: string; vendorId?: string | null; category?: string | null; billId?: string | null }
): Promise<Receipt> {
  const response = await fetch(`${API_URL}/api/receipts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Receipt>(response);
}

export async function approveReceipt(
  id: string,
  expenseAccountId: string,
  paymentAccountId: string
): Promise<{ receipt: Receipt; journalEntry: JournalEntry }> {
  const response = await fetch(`${API_URL}/api/receipts/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expenseAccountId, paymentAccountId }),
  });
  return handleResponse<{ receipt: Receipt; journalEntry: JournalEntry }>(response);
}

export async function rejectReceipt(id: string): Promise<Receipt> {
  const response = await fetch(`${API_URL}/api/receipts/${id}/reject`, {
    method: 'POST',
  });
  return handleResponse<Receipt>(response);
}

// ==================== DASHBOARD API ====================

export interface DashboardData {
  cashBalance: string;
  totalIncome: string;
  totalExpenses: string;
  netIncome: string;
  outstandingInvoicesCount: number;
  outstandingInvoicesTotal: string;
}

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch(`${API_URL}/api/dashboard`);
  return handleResponse<DashboardData>(response);
}

// ==================== CUSTOMERS API ====================

export interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
}

export async function getCustomers(params?: { search?: string; isActive?: boolean }): Promise<Customer[]> {
  const q = new URLSearchParams();
  if (params?.search) q.append('search', params.search);
  if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
  const response = await fetch(`${API_URL}/api/customers${q.toString() ? `?${q}` : ''}`);
  return handleResponse<Customer[]>(response);
}

export async function getCustomer(id: string): Promise<Customer> {
  const response = await fetch(`${API_URL}/api/customers/${id}`);
  return handleResponse<Customer>(response);
}

export async function createCustomer(data: CreateCustomerInput): Promise<Customer> {
  const response = await fetch(`${API_URL}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Customer>(response);
}

export async function updateCustomer(id: string, data: Partial<CreateCustomerInput> & { isActive?: boolean }): Promise<Customer> {
  const response = await fetch(`${API_URL}/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Customer>(response);
}

export async function deleteCustomer(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/customers/${id}`, { method: 'DELETE' });
  return handleResponse<void>(response);
}

// ==================== VENDORS API ====================

export interface Vendor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export async function getVendors(params?: { search?: string; isActive?: boolean }): Promise<Vendor[]> {
  const q = new URLSearchParams();
  if (params?.search) q.append('search', params.search);
  if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
  const response = await fetch(`${API_URL}/api/vendors${q.toString() ? `?${q}` : ''}`);
  return handleResponse<Vendor[]>(response);
}

export async function getVendor(id: string): Promise<Vendor> {
  const response = await fetch(`${API_URL}/api/vendors/${id}`);
  return handleResponse<Vendor>(response);
}

export async function createVendor(data: CreateVendorInput): Promise<Vendor> {
  const response = await fetch(`${API_URL}/api/vendors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Vendor>(response);
}

export async function updateVendor(id: string, data: Partial<CreateVendorInput> & { isActive?: boolean }): Promise<Vendor> {
  const response = await fetch(`${API_URL}/api/vendors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Vendor>(response);
}

export async function deleteVendor(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/vendors/${id}`, { method: 'DELETE' });
  return handleResponse<void>(response);
}

// ==================== INVOICES API ====================

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'VOID';

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  accountId?: string | null;
  account?: { id: string; name: string; code: string } | null;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  customerId: string;
  customer?: Customer;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: string;
  tax: string;
  total: string;
  notes?: string | null;
  journalEntryId?: string | null;
  lines?: InvoiceLine[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineInput {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  amount: number | string;
  accountId?: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  date: string;
  dueDate: string;
  lines: InvoiceLineInput[];
  notes?: string;
  tax?: number;
}

export async function getInvoices(params?: {
  status?: InvoiceStatus;
  customerId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Invoice[]> {
  const q = new URLSearchParams();
  if (params?.status) q.append('status', params.status);
  if (params?.customerId) q.append('customerId', params.customerId);
  if (params?.startDate) q.append('startDate', params.startDate);
  if (params?.endDate) q.append('endDate', params.endDate);
  const response = await fetch(`${API_URL}/api/invoices${q.toString() ? `?${q}` : ''}`);
  return handleResponse<Invoice[]>(response);
}

export async function getInvoice(id: string): Promise<Invoice> {
  const response = await fetch(`${API_URL}/api/invoices/${id}`);
  return handleResponse<Invoice>(response);
}

export async function createInvoice(data: CreateInvoiceInput): Promise<Invoice> {
  const response = await fetch(`${API_URL}/api/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Invoice>(response);
}

export async function updateInvoice(id: string, data: Partial<CreateInvoiceInput>): Promise<Invoice> {
  const response = await fetch(`${API_URL}/api/invoices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Invoice>(response);
}

export async function sendInvoice(id: string): Promise<Invoice> {
  const response = await fetch(`${API_URL}/api/invoices/${id}/send`, { method: 'POST' });
  return handleResponse<Invoice>(response);
}

export async function recordInvoicePayment(id: string, paymentAccountId: string): Promise<{ invoice: Invoice; journalEntry: JournalEntry }> {
  const response = await fetch(`${API_URL}/api/invoices/${id}/record-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentAccountId }),
  });
  return handleResponse<{ invoice: Invoice; journalEntry: JournalEntry }>(response);
}

export async function voidInvoice(id: string): Promise<Invoice> {
  const response = await fetch(`${API_URL}/api/invoices/${id}/void`, { method: 'POST' });
  return handleResponse<Invoice>(response);
}

export async function deleteInvoice(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/invoices/${id}`, { method: 'DELETE' });
  return handleResponse<void>(response);
}

// ==================== BILLS API ====================

export type BillStatus = 'DRAFT' | 'RECEIVED' | 'PAID' | 'VOID';

export interface BillLine {
  id: string;
  billId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  accountId?: string | null;
  account?: { id: string; name: string; code: string } | null;
}

export interface Bill {
  id: string;
  billNo: string;
  vendorId: string;
  vendor?: Vendor;
  date: string;
  dueDate: string;
  status: BillStatus;
  total: string;
  notes?: string | null;
  isRecurring?: boolean;
  recurrenceInterval?: string | null;
  nextDueDate?: string | null;
  journalEntryId?: string | null;
  lines?: BillLine[];
  createdAt: string;
  updatedAt: string;
}

export interface BillLineInput {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  amount: number | string;
  accountId?: string;
}

export interface CreateBillInput {
  vendorId: string;
  date: string;
  dueDate: string;
  lines: BillLineInput[];
  notes?: string;
  isRecurring?: boolean;
  recurrenceInterval?: string;
  nextDueDate?: string;
}

export async function getBills(params?: {
  status?: BillStatus;
  vendorId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Bill[]> {
  const q = new URLSearchParams();
  if (params?.status) q.append('status', params.status);
  if (params?.vendorId) q.append('vendorId', params.vendorId);
  if (params?.startDate) q.append('startDate', params.startDate);
  if (params?.endDate) q.append('endDate', params.endDate);
  const response = await fetch(`${API_URL}/api/bills${q.toString() ? `?${q}` : ''}`);
  return handleResponse<Bill[]>(response);
}

export async function getBill(id: string): Promise<Bill> {
  const response = await fetch(`${API_URL}/api/bills/${id}`);
  return handleResponse<Bill>(response);
}

export async function createBill(data: CreateBillInput): Promise<Bill> {
  const response = await fetch(`${API_URL}/api/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Bill>(response);
}

export async function updateBill(id: string, data: Partial<CreateBillInput>): Promise<Bill> {
  const response = await fetch(`${API_URL}/api/bills/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Bill>(response);
}

export async function receiveBill(id: string): Promise<Bill> {
  const response = await fetch(`${API_URL}/api/bills/${id}/receive`, { method: 'POST' });
  return handleResponse<Bill>(response);
}

export async function payBill(id: string, paymentAccountId: string): Promise<Bill> {
  const response = await fetch(`${API_URL}/api/bills/${id}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentAccountId }),
  });
  return handleResponse<Bill>(response);
}

export async function voidBill(id: string): Promise<Bill> {
  const response = await fetch(`${API_URL}/api/bills/${id}/void`, { method: 'POST' });
  return handleResponse<Bill>(response);
}

export async function deleteBill(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/bills/${id}`, { method: 'DELETE' });
  return handleResponse<void>(response);
}

// ==================== RECONCILIATION API ====================

export interface BankTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: string;
  isMatched: boolean;
  matchedLineId?: string | null;
  createdAt: string;
}

export interface ReconciliationData {
  bankTransactions: BankTransaction[];
  journalLines: (JournalLine & { journalEntry: { date: string; description: string; referenceNo?: string | null } })[];
}

export async function importBankTransactions(accountId: string, transactions: { date: string; description: string; amount: number }[]): Promise<{ imported: number }> {
  const response = await fetch(`${API_URL}/api/reconciliation/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, transactions }),
  });
  return handleResponse<{ imported: number }>(response);
}

export async function getReconciliationData(accountId: string): Promise<ReconciliationData> {
  const response = await fetch(`${API_URL}/api/reconciliation/${accountId}`);
  return handleResponse<ReconciliationData>(response);
}

export async function matchTransaction(bankTransactionId: string, journalLineId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/reconciliation/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankTransactionId, journalLineId }),
  });
  return handleResponse<{ success: boolean }>(response);
}

export async function unmatchTransaction(bankTransactionId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/reconciliation/unmatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankTransactionId }),
  });
  return handleResponse<{ success: boolean }>(response);
}

export async function completeReconciliation(accountId: string, statementDate: string, statementBalance: number): Promise<{ id: string }> {
  const response = await fetch(`${API_URL}/api/reconciliation/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, statementDate, statementBalance }),
  });
  return handleResponse<{ id: string }>(response);
}

// ==================== REPORTS API ====================

export interface ProfitLossReport {
  revenue: { accountId: string; accountName: string; accountCode: string; balance: string }[];
  expenses: { accountId: string; accountName: string; accountCode: string; balance: string }[];
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
}

export interface BalanceSheetReport {
  assets: { accountId: string; accountName: string; accountCode: string; balance: string }[];
  liabilities: { accountId: string; accountName: string; accountCode: string; balance: string }[];
  equity: { accountId: string; accountName: string; accountCode: string; balance: string }[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
}

export interface TrialBalanceReport {
  rows: { accountId: string; accountCode: string; accountName: string; accountType: string; debitTotal: string; creditTotal: string }[];
  totals: { debitTotal: string; creditTotal: string };
}

export async function getProfitLoss(params?: { startDate?: string; endDate?: string }): Promise<ProfitLossReport> {
  const q = new URLSearchParams();
  if (params?.startDate) q.append('startDate', params.startDate);
  if (params?.endDate) q.append('endDate', params.endDate);
  const response = await fetch(`${API_URL}/api/reports/profit-loss${q.toString() ? `?${q}` : ''}`);
  return handleResponse<ProfitLossReport>(response);
}

export async function getBalanceSheet(params?: { asOf?: string }): Promise<BalanceSheetReport> {
  const q = new URLSearchParams();
  if (params?.asOf) q.append('asOf', params.asOf);
  const response = await fetch(`${API_URL}/api/reports/balance-sheet${q.toString() ? `?${q}` : ''}`);
  return handleResponse<BalanceSheetReport>(response);
}

export async function getTrialBalance(params?: { startDate?: string; endDate?: string }): Promise<TrialBalanceReport> {
  const q = new URLSearchParams();
  if (params?.startDate) q.append('startDate', params.startDate);
  if (params?.endDate) q.append('endDate', params.endDate);
  const response = await fetch(`${API_URL}/api/reports/trial-balance${q.toString() ? `?${q}` : ''}`);
  return handleResponse<TrialBalanceReport>(response);
}

// ==================== INSIGHTS API ====================

export interface InsightAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  detail: string;
  link: string;
}

export interface InsightsData {
  alerts: InsightAlert[];
  generatedAt: string;
}

export async function getInsights(): Promise<InsightsData> {
  const response = await fetch(`${API_URL}/api/insights`);
  return handleResponse<InsightsData>(response);
}

// ==================== AI CHAT API ====================

export async function sendAiMessage(message: string): Promise<{ reply: string }> {
  const response = await fetch(`${API_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return handleResponse<{ reply: string }>(response);
}

// ==================== RECURRING API ====================

export async function triggerRecurring(): Promise<{ created: number; details: string[] }> {
  const response = await fetch(`${API_URL}/api/recurring/run`, { method: 'POST' });
  return handleResponse<{ created: number; details: string[] }>(response);
}

export async function getRecurringBills(): Promise<Bill[]> {
  const response = await fetch(`${API_URL}/api/recurring/bills`);
  return handleResponse<Bill[]>(response);
}

// ==================== CSV IMPORT API ====================

export async function importCSVTransactions(accountId: string, file: File): Promise<{ imported: number; suggestions: number }> {
  const formData = new FormData();
  formData.append('csv', file);
  formData.append('accountId', accountId);
  const response = await fetch(`${API_URL}/api/reconciliation/import-csv`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<{ imported: number; suggestions: number }>(response);
}
