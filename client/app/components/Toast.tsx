'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { toast, type ToastEvent } from '@/lib/toast';
import { cn } from '@/lib/utils';

const DURATION = 4000;

const VARIANTS = {
  success: {
    icon: CheckCircle,
    bar: 'bg-emerald-500',
    iconClass: 'text-emerald-500',
    bg: 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
  },
  error: {
    icon: XCircle,
    bar: 'bg-red-500',
    iconClass: 'text-red-500',
    bg: 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
  },
  info: {
    icon: Info,
    bar: 'bg-blue-500',
    iconClass: 'text-blue-500',
    bg: 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
  },
};

interface ActiveToast extends ToastEvent {
  exiting: boolean;
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    const unsub: () => void = toast._subscribe((event) => {
      setToasts((prev) => [...prev, { ...event, exiting: false }]);
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === event.id ? { ...t, exiting: true } : t))
        );
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== event.id));
        }, 300);
      }, DURATION);
    });
    return unsub;
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    >
      {toasts.map((t) => {
        const { icon: Icon, bar, iconClass, bg } = VARIANTS[t.variant];
        return (
          <div
            key={t.id}
            className={cn(
              'relative overflow-hidden rounded-xl border shadow-lg pointer-events-auto transition-all duration-300',
              bg,
              t.exiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
            )}
          >
            {/* Colour bar */}
            <div className={cn('absolute left-0 top-0 bottom-0 w-1', bar)} />

            <div className="flex items-start gap-3 px-4 py-3 pl-5">
              <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', iconClass)} />
              <p className="flex-1 text-sm text-zinc-800 dark:text-zinc-200 leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="ml-1 p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className={cn('h-0.5 w-full', bar, 'opacity-30')}>
              <div
                className={cn('h-full', bar)}
                style={{ animation: `toast-shrink ${DURATION}ms linear forwards` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
