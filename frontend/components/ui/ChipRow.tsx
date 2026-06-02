'use client';

/**
 * ChipRow — горизонтальный скролл-ряд чипов с масками по краям (§3, §4.1).
 *
 * Использовать для пресетов фильтров, ниш быстрого старта, тегов.
 * Дочерние элементы (<Chip />) обтекают по горизонтали со snap-scroll;
 * на мобайле прокручиваются пальцем, на десктопе обычным скролл-жестом.
 *
 * CSS: см. .chip-row в globals.css. Маска по краям + scroll-snap-x.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ChipRowProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function ChipRow({ className, children, ...rest }: ChipRowProps) {
  return (
    <div className={cn('chip-row', className)} {...rest}>
      {children}
    </div>
  );
}

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: React.ReactNode;
}

export function Chip({ className, active, icon, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      data-active={active || undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-medium whitespace-nowrap',
        'border transition-colors',
        active
          ? 'bg-brand-gradient text-white border-transparent shadow-v2-sm'
          : 'bg-[hsl(var(--surface))] text-[hsl(var(--text))] border-[hsl(var(--border))] hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400',
        className
      )}
      {...rest}
    >
      {icon && <span className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
      {children}
    </button>
  );
}
