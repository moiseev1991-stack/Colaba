import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Секция карточки компании (вид Premium, 17.09): белая плашка с мягкой рамкой,
 * мелкий заголовок капсом слева и необязательный элемент справа (переключатель, ссылка).
 * Общая для всех блоков панели — сводки, сравнения с нишей, контактов, юр. данных.
 */
export function DrawerSection({
  title,
  aside,
  children,
  className,
  tone = 'default',
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** muted — серая подложка для второстепенного (пустые состояния, подсказки). */
  tone?: 'default' | 'muted';
}) {
  return (
    <section
      className={cn(
        'rounded-card border p-4',
        tone === 'muted' ? 'border-transparent bg-ui-surface-2' : 'border-ui-border bg-ui-surface',
        className,
      )}
    >
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ui-text-muted">
              {title}
            </h3>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
