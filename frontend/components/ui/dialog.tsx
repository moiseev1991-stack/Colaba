'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

// §4.12 ТЗ редизайна 2026-06-03 (Phase C batch 4): Dialog на v2-токены.
// Раньше — bg-white/bg-gray-800 + border-gray-100/200 + text-gray-{400,600,900,white}
// с парными dark: вариантами. Теперь — единые токены --surface/--border/--text/--muted
// + бренд-радиусы. Поведение, hit-area, safe-area, escape-handler и position='right'
// (top-14 под навбаром) — без изменений.

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

// Общий заголовок с крестиком — одинаковый для center и right.
function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      className="flex shrink-0 items-start justify-between px-6 py-4"
      style={{ borderBottom: '1px solid hsl(var(--border))' }}
    >
      <h2
        className="font-display font-semibold tracking-tight text-lg"
        style={{ color: 'hsl(var(--text))' }}
      >
        {title}
      </h2>
      <button
        onClick={onClose}
        // -m-2 p-2 = расширенный hit-area для пальца (40×40 фактических,
        // 20×20 видимых) — аудит ловил промахи мимо мелкого крестика.
        className="-m-2 ml-1 shrink-0 rounded-v2-sm p-2 transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]"
        style={{ color: 'hsl(var(--muted))' }}
        aria-label="Закрыть"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
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
            'absolute right-0 top-14 z-50 flex h-[calc(100%-3.5rem)] w-full max-w-xl flex-col shadow-2xl',
            'border-l',
            // safe-area для iOS — снизу не обрезается
            'pb-[env(safe-area-inset-bottom)]',
            className,
          )}
          style={{
            background: 'hsl(var(--surface))',
            borderColor: 'hsl(var(--border))',
          }}
        >
          {title && <DialogHeader title={title} onClose={onClose} />}
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
          'relative z-50 mx-4 flex w-full max-w-md max-h-[85vh] flex-col rounded-v2-lg border shadow-v2',
          // safe-area для iOS — снизу не обрезается на телефонах с нотчем
          'pb-[env(safe-area-inset-bottom)]',
          className,
        )}
        style={{
          background: 'hsl(var(--surface))',
          borderColor: 'hsl(var(--border))',
        }}
      >
        {/* Header */}
        {title && <DialogHeader title={title} onClose={onClose} />}
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
