'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import { clearSession, getCurrentUser, isAuthenticated } from '@/lib/auth';

const HIDDEN_PATHS = new Set(['/login', '/signup', '/auth/callback', '/invite']);

export function ProfileButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated()) return;
    const user = getCurrentUser();
    if (!user) return;
    setName(user.name || '');
    setEmail(user.email || '');
    const parts = (user.name || user.email || '').trim().split(/\s+/);
    setInitials(
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : (parts[0] || '?').slice(0, 2).toUpperCase()
    );
  }, [pathname]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  if (HIDDEN_PATHS.has(pathname) || !isAuthenticated()) return null;

  function onLogout() {
    clearSession();
    window.location.href = '/login';
  }

  return (
    <div ref={ref} className="fixed top-4 right-4 z-50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-9 w-9 rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-semibold flex items-center justify-center shadow-md hover:opacity-90 transition-opacity ring-2 ring-white dark:ring-zinc-900"
        aria-label="Profile menu"
      >
        {initials || <User className="h-4 w-4" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden">
          {/* User info */}
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {initials || <User className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0">
                {name && <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{name}</p>}
                <p className="text-xs text-zinc-500 truncate">{email}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
