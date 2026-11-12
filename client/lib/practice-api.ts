import { API_BASE_URL, apiFetch } from './api';

export async function workflowRequest<T>(path: string, body?: Record<string, unknown>, method = 'POST'): Promise<T> {
  const response = await apiFetch(API_BASE_URL + '/api' + path, body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'This workflow could not finish. Retry your connection.');
  return data as T;
}
