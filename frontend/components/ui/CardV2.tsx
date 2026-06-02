'use client';

/**
 * CardV2 — базовая карточка нового языка (§3 ТЗ редизайна 2026-06-03).
 *
 * Базовая (surface, radius v2-lg, shadow v2-sm, border) + hover-вариант
 * через .lift-v2 (см. globals.css). Слот под header/body/footer задаёт
 * сам потребитель — компонент не диктует структуру внутри, только обвязку.
 *
 * Назначение: единая визуальная база для карточек лидов / метрик / списков
 * рассылок / истории. На замену разнокалиберных <div className="rounded-md..."/>.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Подъём + цветная бренд-тень на hover. По умолчанию false. */
  interactive?: boolean;
  /** Включить page-load reveal-up (нужен родитель .reveal-stack). */
  reveal?: boolean;
  as?: 'div' | 'li' | 'article' | 'section';
}

export const CardV2 = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, reveal, as = 'div', ...rest }, ref) => {
    const Component = as as 'div';
    return (
      <Component
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(
          'rounded-v2-lg border bg-[hsl(var(--surface))] shadow-v2-sm',
          'border-[hsl(var(--border))]',
          interactive && 'lift-v2 cursor-pointer',
          reveal && 'reveal-item',
          className
        )}
        {...rest}
      />
    );
  }
);
CardV2.displayName = 'CardV2';
