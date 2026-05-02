'use client';

import type { AuthWorkspace, AuthUser } from './api';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const WORKSPACE_KEY = 'workspace_id';

export function setSession(token: string, user: AuthUser, workspaces: AuthWorkspace[] = []) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Always reset workspace on fresh login to avoid stale workspace causing 401 loops
  if (workspaces.length > 0) {
    localStorage.setItem(WORKSPACE_KEY, workspaces[0].id);
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
}

export function getToken() {
  return typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getWorkspaceId(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(WORKSPACE_KEY);
}

export function setWorkspaceId(workspaceId: string) {
  localStorage.setItem(WORKSPACE_KEY, workspaceId);
}

