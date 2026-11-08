import { API_BASE_URL, apiFetch } from './api';
export type ClosePeriod = { id: string; startDate: string; endDate: string; targetDate: string; status: 'OPEN' | 'CLOSED'; createdById: string; closedById: string | null; closedAt: string | null };
export type Review = { status: string; ownerId: string; dueDate: string; support: string; reason: string; reviewedById: string };
export type CloseAccount = { id: string; code: string; name: string; role: string; balance: string; fingerprint: string; status: string; stale: boolean; bankProof: string | null; review?: Review };
export type CloseState = ClosePeriod & { accounts: CloseAccount[]; currency: string; completed: number; canClose: boolean; savedProof?: boolean; earlierOpen?: number;
  totals: { debit: string; credit: string }; gates: { schedulesMissing?:number;taxEvidencePending?:number;trialBalance: boolean; receivables: boolean; payables: boolean; drafts: number; draftInvoices: number; draftBills: number; pendingReceipts: number; accountsReviewed: boolean; bankEvidence: boolean; separateReview: boolean };
  ar: { ledgerBalance: string; subledgerBalance: string; difference: string }; ap: { ledgerBalance: string; subledgerBalance: string; difference: string } };
async function request<T>(path = '', method = 'GET', body?: unknown): Promise<T> {
  const response = await apiFetch(API_BASE_URL + '/api/periods' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Close action could not finish.'); return data;
}
export const getPeriods = () => request<ClosePeriod[]>();
export const getPeriod = (id: string) => request<CloseState>('/' + id);
export const createPeriod = (dates: { startDate: string; endDate: string; targetDate: string }) => request<ClosePeriod>('', 'POST', dates);
export const saveReview = (id: string, accountId: string, body: Review & { fingerprint: string }) => request('/' + id + '/accounts/' + accountId, 'PUT', body);
export const closePeriod = (id: string) => request('/' + id + '/close', 'POST', {});
export const reopenPeriod = (id: string, reason: string) => request('/' + id + '/reopen', 'POST', { reason });
