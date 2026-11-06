'use client';

import { useSyncExternalStore } from 'react';
import type { AuthWorkspace, AuthUser } from './api';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const WORKSPACE_KEY = 'workspace_id';
const SESSION_CHANGE = 'accountrix:session-change';
const WORKSPACE_CHANGE = 'accountrix:workspace-change';

function subscribeToSession(callback: () => void) {
  window.addEventListener(SESSION_CHANGE, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(SESSION_CHANGE, callback);
    window.removeEventListener('storage', callback);
  };
}

function subscribeToWorkspace(callback: () => void) {
  window.addEventListener(WORKSPACE_CHANGE, callback);
  const unsubscribe = subscribeToSession(callback);
  return () => {
    window.removeEventListener(WORKSPACE_CHANGE, callback);
    unsubscribe();
  };
}

export function setSession(token: string, user: AuthUser, workspaces: AuthWorkspace[] = []) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Always reset workspace on fresh login to avoid stale workspace causing 401 loops
  if (workspaces.length > 0) {
    localStorage.setItem(WORKSPACE_KEY, workspaces[0].id);
  }
  window.dispatchEvent(new Event(SESSION_CHANGE));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGE));
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
  if (getWorkspaceId() === workspaceId) return;
  localStorage.setItem(WORKSPACE_KEY, workspaceId);
  window.dispatchEvent(new Event(WORKSPACE_CHANGE));
}


export function useIsAuthenticated() {
  return useSyncExternalStore(subscribeToSession, isAuthenticated, () => false);
}

export function useActiveWorkspaceId() {
  return useSyncExternalStore(subscribeToWorkspace, getWorkspaceId, () => null);
}
