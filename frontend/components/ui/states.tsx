'use client';

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Состояния экранов кабинета (PR 3.3): пусто и ошибка. Загрузка — Skeleton из './Skeleton'.
 */

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Пример того, как экран выглядит с данными, — под пустым состоянием. */
  demo?: ReactNode;
  demoNote?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, demo, demoNote, className }: EmptyStateProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="rounded-card border border-dashed border-ui-border bg-ui-surface px-6 py-12 text-center">
        {icon && (
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-card bg-ui-accent/10 text-ui-accent">
            {icon}
          </div>
        )}
        <h3 className="mb-2 text-base font-semibold text-ui-text">{title}</h3>
        {description && <div className="mx-auto max-w-[480px] text-small leading-snug text-ui-text-muted">{description}</div>}
        {action && <div className="mt-5 inline-flex justify-center">{action}</div>}
      </div>

      {demo && (
        <div className="overflow-hidden rounded-card border border-ui-border bg-ui-surface">
          <div className="flex items-center gap-2 border-b border-ui-border bg-[var(--signal-warm-bg)] px-4 py-2.5">
            <span className="inline-flex h-5 items-center rounded-control px-1.5 text-xs font-semibold text-[color:var(--signal-warm)]">
              Пример
            </span>
            <span className="text-xs text-ui-text-muted">{demoNote ?? 'демо-данные — не ваши'}</span>
          </div>
          {demo}
        </div>
      )}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** Обычно кнопка «Попробовать снова» или «Обновить страницу». */
  action?: ReactNode;
  /** Во весь экран — для границы ошибок всего приложения. */
  fullScreen?: boolean;
  className?: string;
}

export function ErrorState({ title = 'Что-то пошло не так', description, action, fullScreen, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-12 text-center',
        fullScreen && 'min-h-screen bg-ui-bg',
        className,
      )}
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-ui-danger/10 text-ui-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <div className="max-w-md">
        <h2 className="text-xl font-semibold text-ui-text">{title}</h2>
        {description && <p className="mt-2 text-sm text-ui-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
