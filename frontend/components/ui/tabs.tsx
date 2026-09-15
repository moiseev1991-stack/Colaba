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
    const last = items.length - 1;
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
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
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              '-mb-px rounded-t-control border-b-2 px-3 py-2 text-small font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40',
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
