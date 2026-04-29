type ToastVariant = 'success' | 'error' | 'info';

interface ToastEvent {
  id: number;
  message: string;
  variant: ToastVariant;
}

type Listener = (event: ToastEvent) => void;

let counter = 0;
const listeners: Set<Listener> = new Set();

function emit(message: string, variant: ToastVariant) {
  const event: ToastEvent = { id: ++counter, message, variant };
  listeners.forEach((fn) => fn(event));
}

export const toast = {
  success: (message: string) => emit(message, 'success'),
  error: (message: string) => emit(message, 'error'),
  info: (message: string) => emit(message, 'info'),
  _subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

export type { ToastEvent, ToastVariant };
