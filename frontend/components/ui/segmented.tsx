'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Segmented — переключатель из 2–4 вариантов в серой дорожке (вид Premium, 16.09):
 * «По городу / В радиусе», «Список / Карта». Выбранный — белая пилюля с тенью.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  size = 'md',
  className,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('inline-flex gap-0.5 rounded-full bg-ui-surface-2 p-1', className)}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled || opt.disabled}
            title={opt.title}
            onClick={() => !selected && onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40',
              'disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm' ? 'px-3.5 py-1.5 text-small' : 'px-4 py-2 text-small',
              selected
                ? 'bg-ui-surface text-ui-text shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                : 'text-ui-text-muted hover:text-ui-text',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
