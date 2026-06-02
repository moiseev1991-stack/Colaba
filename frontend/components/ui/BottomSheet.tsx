'use client';

/**
 * BottomSheet — мобильный аналог Drawer (§3 ТЗ редизайна 2026-06-03).
 *
 * Выезжает снизу, грабер сверху, безопасная зона iOS снизу, тап-вне/Escape
 * закрывают. Используется на мобайле для:
 *   - фильтр-панели «По картам» (§4.1)
 *   - модалок «В список» / «Письмо» / «Подтвердить»
 *
 * Десктоп использует Drawer справа (MapsCompanyDetailDrawer). Сам компонент
 * BottomSheet — только для мобайла; на md+ обычно рендерится через
 * условие — потребитель решает.
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Максимальная высота шторки: 'auto' | '80vh' | '90vh' */
  maxHeight?: string;
  /** Дополнительный класс на контентный контейнер. */
  contentClassName?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = '85vh',
  contentClassName,
}: Props) {
  // Escape закрывает шторку.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Блокируем прокрутку body когда открыта.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-[reveal-up-v2_0.18s_ease-out_both]"
      />
      {/* Sheet */}
      <div
        className={cn(
          'relative w-full bg-[hsl(var(--surface))] shadow-v2-hover rounded-t-v2-lg',
          'border-t border-[hsl(var(--border))]',
          'safe-pb',
          'animate-[reveal-up-v2_0.24s_cubic-bezier(0.4,0,0.2,1)_both]'
        )}
        style={{ maxHeight }}
      >
        {/* Грабер */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-[hsl(var(--border))]" />
        </div>
        {/* Хедер */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--border))]">
          <div className="font-display text-base font-semibold text-[hsl(var(--text))]">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-11 w-11 place-items-center rounded-v2-sm text-[hsl(var(--muted))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Контент */}
        <div
          className={cn('overflow-y-auto px-4 py-3', contentClassName)}
          style={{ maxHeight: `calc(${maxHeight} - 88px)` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
