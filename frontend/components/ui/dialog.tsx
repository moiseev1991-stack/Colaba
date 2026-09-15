'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// PR 3.3: единые Dialog и Drawer кабинета — портал в body, role="dialog" и aria-modal,
// ловушка фокуса (Tab не уходит под затемнение), возврат фокуса на элемент, открывший окно,
// Escape и блокировка прокрутки страницы. API прежний: open, onClose, title, position.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * 'center' (по умолчанию) — модалка по центру.
   * 'right' — панель справа на всю высоту под шапкой кабинета (top-14 = высота AppHeader),
   * на телефоне — во всю ширину. Для неё есть короткая запись <Drawer>.
   */
  position?: 'center' | 'right';
}

function DialogHeader({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-start justify-between border-b border-ui-border px-6 py-4">
      <h2 id={id} className="text-base font-semibold tracking-tight text-ui-text">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        data-dialog-close
        // -m-2 p-2: зона нажатия 40×40 при видимом крестике 20×20.
        className="-m-2 ml-1 shrink-0 rounded-control p-2 text-ui-text-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40"
        aria-label="Закрыть"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

export function Dialog({ open, onClose, title, children, className, position = 'center' }: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // onClose часто приходит новой стрелкой на каждый рендер — держим последнюю версию в ref,
  // чтобы ловушка фокуса не пересоздавалась и фокус не прыгал.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open || !mounted) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null) : [];

    // Первый фокус — на первое поле или кнопку внутри (не на крестик), иначе на саму панель.
    (focusables().find((el) => !el.hasAttribute('data-dialog-close')) ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    // Без блокировки колесо над затемнением прокручивает страницу под окном.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  const panelProps = {
    ref: panelRef,
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': title ? titleId : undefined,
    tabIndex: -1,
  } as const;
  const header = title ? <DialogHeader id={titleId} title={title} onClose={onClose} /> : null;

  const content =
    position === 'right' ? (
      <div className="fixed inset-0 z-50">
        {/* Затемнение светлее, чем у модалки: карта и выдача под панелью остаются читаемыми. */}
        <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden />
        <div
          {...panelProps}
          className={cn(
            'absolute right-0 top-14 z-50 flex h-[calc(100%-3.5rem)] w-full max-w-xl flex-col border-l border-ui-border bg-ui-surface shadow-overlay outline-none',
            'pb-[env(safe-area-inset-bottom)]',
            className,
          )}
        >
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        </div>
      </div>
    ) : (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
        <div
          {...panelProps}
          className={cn(
            'relative z-50 mx-4 flex max-h-[85vh] w-full max-w-md flex-col rounded-panel border border-ui-border bg-ui-surface shadow-overlay outline-none',
            'pb-[env(safe-area-inset-bottom)]',
            className,
          )}
        >
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        </div>
      </div>
    );

  return createPortal(content, document.body);
}

/** Drawer — панель справа; то же, что <Dialog position="right">. */
export function Drawer(props: Omit<DialogProps, 'position'>) {
  return <Dialog {...props} position="right" />;
}

interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return <div className={cn('mt-6 flex justify-end gap-3', className)}>{children}</div>;
}
