'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabs — единые вкладки кабинета (PR 3.3): role="tablist"/"tab", aria-selected,
 * переключение стрелками ←/→ и клавишами Home/End. Управляемые: value + onChange;
 * содержимое выбранной вкладки страница рендерит сама.
 */
export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Неактивная вкладка: видна серой, не выбирается ни мышью, ни с клавиатуры. */
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
}

export function Tabs<T extends string>({ items, value, onChange, className, 'aria-label': ariaLabel }: TabsProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    // Стрелки ходят только по активным вкладкам.
    const enabled = items.flatMap((item, i) => (item.disabled ? [] : [i]));
    const pos = enabled.indexOf(index);
    const last = enabled.length - 1;
    const nextPos =
      e.key === 'ArrowRight' ? (pos === last ? 0 : pos + 1)
      : e.key === 'ArrowLeft' ? (pos <= 0 ? last : pos - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : -1;
    if (nextPos < 0 || enabled.length === 0) return;
    e.preventDefault();
    const next = enabled[nextPos];
    onChange(items[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex flex-wrap gap-1 border-b border-ui-border', className)}>
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => !item.disabled && onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              '-mb-px rounded-t-control border-b-2 px-3 py-2 text-small font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected ? 'border-ui-accent text-ui-accent' : 'border-transparent text-ui-text-muted hover:text-ui-text',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
