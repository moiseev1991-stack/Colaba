'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * Позиция диалога:
   *   - 'center' (по умолчанию) — модалка по центру экрана.
   *   - 'right' — slide-in панель справа, фикс. ширина max-w-xl, full
   *     height. Backdrop полупрозрачный — содержимое слева (карта,
   *     выдача) остаётся видимым. На mobile (<sm) разворачивается
   *     по полной ширине, как обычный full-screen drawer.
   *     Стартует ПОД глобальным навбаром (top-14 = 56px = AppHeader h-14),
   *     иначе шапка drawer'а (название + крестик) уезжала под навбар и
   *     юзер не мог его закрыть.
   */
  position?: 'center' | 'right';
}

export function Dialog({ open, onClose, title, children, className, position = 'center' }: DialogProps) {
  // Escape закрывает любую модалку. Раньше юзер мог закрыть только клик
  // по крестику/бэкдропу — на мобиле когда крестик уехал за навбар,
  // diaglog становился ловушкой.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  if (position === 'right') {
    return (
      <div className="fixed inset-0 z-50">
        {/* Backdrop — менее тёмный чем у центрального, чтобы карта/список
            под ним оставались читаемыми. Клик закрывает. */}
        <div
          className="fixed inset-0 bg-black/25"
          onClick={onClose}
        />
        <div
          className={cn(
            // top-14 = 56px = высота глобального AppHeader (h-14). Без
            // этого шапка drawer уезжала под навбар и крестик закрытия
            // был некликабельным — аудит ловил баг D/C и M3/D.
            'absolute right-0 top-14 z-50 flex h-[calc(100%-3.5rem)] w-full max-w-xl flex-col bg-white shadow-2xl dark:bg-gray-800',
            'border-l border-gray-200 dark:border-gray-700',
            // safe-area для iOS — снизу не обрезается
            'pb-[env(safe-area-inset-bottom)]',
            className,
          )}
        >
          {title && (
            <div className="flex shrink-0 items-start justify-between border-b border-gray-100 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
              <button
                onClick={onClose}
                // p-2 -m-2 = расширенный hit-area (40×40 fact, видим 20×20)
                // — без этого тап пальцем мимо крестика, аудит ловил.
                className="-m-2 ml-1 shrink-0 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Dialog */}
      <div
        className={cn(
          'relative z-50 mx-4 flex w-full max-w-md max-h-[85vh] flex-col bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 shadow-lg',
          // safe-area для iOS — снизу не обрезается на телефонах с нотчем
          'pb-[env(safe-area-inset-bottom)]',
          className
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 dark:border-gray-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
            <button
              onClick={onClose}
              // -m-2 p-2 = расширенный hit-area для пальца (40×40 фактических,
              // 20×20 видимых) — аудит ловил промахи мимо мелкого крестика.
              className="-m-2 ml-1 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-colors"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div className={cn('flex gap-3 justify-end mt-6', className)}>
      {children}
    </div>
  );
}
