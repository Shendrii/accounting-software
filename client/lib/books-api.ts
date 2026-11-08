import { API_BASE_URL, apiFetch } from './api';

export type WorkspaceProfile = {
  id: string; name: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'APPROVER' | 'VIEWER'; legalName: string | null;
  country: 'PH' | 'US' | null; currency: 'PHP' | 'USD'; entityType: string | null; region: string | null;
  fiscalYearStartMonth: number; booksStartDate: string | null; accountingBasis: string;
  separateCloseReviewer?: boolean;
  memberCanPost?: boolean;
  requireJournalApproval?: boolean;
  taxSettings: { vatStatus?: string; withholdingAgent?: boolean; salesTaxRegistered?: boolean; salesTaxJurisdictions?: string; contractorTracking?: boolean } | null;
  setupCompletedAt: string | null; currencyLocked: boolean; openingEligible: boolean;
  openingBalance: { id: string; asOfDate: string; currency: string; createdAt: string; snapshot: OpeningPreview } | null;
};
export type SetupInput = Omit<WorkspaceProfile, 'id' | 'name' | 'role' | 'setupCompletedAt' | 'currencyLocked' | 'openingEligible' | 'openingBalance'> & { createChart: boolean };
export type OpeningInput = { balancesCsv: string; receivablesCsv: string; payablesCsv: string; requestId?: string };
export type OpeningPreview = {
  asOf: string; currency: string; canPost: boolean;
  balances: { accountCode: string; accountName: string; debit: string; credit: string }[];
  receivables: { partyName: string; reference: string; amount: string; date: string; dueDate: string; accountCode: string }[];
  payables: { partyName: string; reference: string; amount: string; date: string; dueDate: string; accountCode: string }[];
  controls: { accountId: string; accountCode: string; accountName: string; balance: string; support: string; difference: string }[];
  totals: { debit: string; credit: string; difference: string };
};
export type AgingReport = {
  kind: 'receivables' | 'payables'; asOf: string; currency: string; basis: string; agingBy: string;
  page: number; pageSize: number; total: number; totalPages: number;
  items: { recordType?:'DOCUMENT'|'CREDIT';id: string; reference: string; partyId: string; partyName: string; date: string; dueDate: string; originalAmount: string; paidAsOf: string; balance: string; age: number; bucket: string; isOpeningBalance: boolean }[];
  parties: { partyId: string; partyName: string; balance: string; debits: string; credits: string; documents: number; buckets: Record<string, string> }[];
  totals: { net: string; debits: string; credits: string }; buckets: Record<string, string>;
  reconciliation: { controls: { accountId: string; code: string; name: string; ledgerBalance: string; subledgerBalance: string; difference: string }[];
    ledgerBalance: string; subledgerBalance: string; difference: string; unmappedDocuments: number; unverifiedDocuments: number; balanced: boolean };
};
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await apiFetch(API_BASE_URL + '/api' + path, { method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'This request could not finish. Try again.');
  return data as T;
}
export const getWorkspaceProfile = () => request<WorkspaceProfile>('/workspace-settings');
export const saveWorkspaceProfile = (body: SetupInput) => request<WorkspaceProfile>('/workspace-settings', 'PUT', body);
export const previewOpeningBalances = (body: OpeningInput) => request<OpeningPreview>('/workspace-settings/opening-balances/preview', 'POST', body);
export const postOpeningBalances = (body: OpeningInput) => request<WorkspaceProfile['openingBalance']>('/workspace-settings/opening-balances', 'POST', body);
export const getAgingReport = (query: Record<string, string>) => request<AgingReport>('/reports/aging?' + new URLSearchParams(query));
export type PaymentHistory = { id: string; amount: string; journalEntry: { id: string; date: string }; reversalEntryId?: string | null; reversalEntry?: { id: string; date: string } | null; reversalReason?: string | null };
export const reverseRecordedPayment = (kind: 'invoice' | 'bill', documentId: string, paymentId: string, body: { date: string; reason: string; requestId: string }) =>
  request('/' + (kind === 'invoice' ? 'invoices' : 'bills') + '/' + encodeURIComponent(documentId) + '/payments/' + encodeURIComponent(paymentId) + '/reverse', 'POST', body);
