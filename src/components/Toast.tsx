import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Access the toast API. Must be used within {@link ToastProvider}. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'border-green-500/40 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200',
  error: 'border-red-500/40 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  info: 'border-brand-500/40 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200',
};

let counter = 0;

/** Provides toast notifications + renders the toast stack. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++counter;
      setItems((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => remove(id), 3500);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-80 max-w-[90vw] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex animate-fade-in items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${KIND_STYLES[t.kind]}`}
          >
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
              <CloseIcon className="text-base" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
