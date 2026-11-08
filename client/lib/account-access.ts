'use client';
import { API_BASE_URL, apiFetch, type AuthResponse } from './api';
import { clearSession } from './auth';

async function accountRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(API_BASE_URL + '/api/auth/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Account action could not finish.');
  return data;
}
export const requestVerification = () => accountRequest<{ sent?: boolean; verified?: boolean }>('verification/request', {});
export const confirmVerification = (token: string) => accountRequest('verification/confirm', { token });
export const requestPasswordReset = (email: string) => accountRequest('password/request', { email });
export const resetPassword = (token: string, password: string) => accountRequest('password/reset', { token, password });
export async function beginGoogleSignIn(password?: string) {
  const verifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  sessionStorage.setItem('accountrix:oauth', verifier);
  if (password !== undefined) {
    const response = await apiFetch(API_BASE_URL + '/api/auth/google/link', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, password }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Google could not link.');
    window.location.assign(data.url);
  } else window.location.assign(API_BASE_URL + '/api/auth/google/start?challenge=' + challenge);
}
let completing: Promise<AuthResponse> | null = null;
export function completeGoogleSignIn(ticket: string) {
  if (completing) return completing;
  const verifier = sessionStorage.getItem('accountrix:oauth');
  if (!verifier) return Promise.reject(new Error('Start sign-in again in this browser.'));
  completing = accountRequest<AuthResponse>('google/complete', { ticket, verifier }).finally(() => { sessionStorage.removeItem('accountrix:oauth'); });
  return completing;
}
export async function logout() {
  await accountRequest('logout', {});
  clearSession();
  window.location.assign('/login');
}
