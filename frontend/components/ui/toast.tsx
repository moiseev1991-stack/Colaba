'use client';

import * as React from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Уведомления кабинета (PR 3.3b): один <Toaster /> в AppShell вместо alert() и тостов на каждой странице.
 * toast.success / toast.error / toast.info можно вызывать откуда угодно — из обработчиков,
 * catch-блоков и утилит, без хука и провайдера.
 */

type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

const EMPTY: ToastItem[] = [];
const MAX_VISIBLE = 4;
let items: ToastItem[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(type: ToastType, message: string, action?: ToastAction) {
  const id = nextId++;
  items = [...items, { id, type, message, action }].slice(-MAX_VISIBLE);
  emit();
  // Ошибку держим дольше: её нужно успеть прочитать.
  setTimeout(() => dismissToast(id), type === 'error' ? 6000 : 3500);
  return id;
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string, action?: ToastAction) => push('error', message, action),
  info: (message: string) => push('info', message),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const TONE: Record<ToastType, string> = {
  success: 'border-l-[color:var(--signal-good)]',
  error: 'border-l-[color:var(--signal-hot)]',
  info: 'border-l-[color:var(--signal-cool)]',
};

const ICON: Record<ToastType, React.ReactNode> = {
  success: (
    <CheckCircle2 className="h-5 w-5 shrink-0 text-[color:var(--signal-good)]" aria-hidden />
  ),
  error: <XCircle className="h-5 w-5 shrink-0 text-[color:var(--signal-hot)]" aria-hidden />,
  info: <Info className="h-5 w-5 shrink-0 text-[color:var(--signal-cool)]" aria-hidden />,
};

export function Toaster() {
  const list = React.useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-20 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-card border border-l-4 border-ui-border bg-ui-surface px-4 py-3 shadow-floating',
            TONE[t.type],
          )}
        >
          {ICON[t.type]}
          <div className="flex-1 min-w-0">
            <p className="whitespace-pre-line text-sm text-ui-text">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismissToast(t.id);
                }}
                className="mt-1.5 rounded-pill bg-ui-accent px-3 py-1 text-xs font-semibold text-ui-accent-contrast transition-colors hover:opacity-90"
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Закрыть уведомление"
            className="-m-1 shrink-0 rounded-control p-1 text-ui-text-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
