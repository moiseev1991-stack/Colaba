'use client';

/**
 * ButtonV2 — кнопка нового дизайн-языка (§3 ТЗ редизайна 2026-06-03).
 *
 * Варианты:
 *   primary  — бренд-градиент (главное действие на блок)
 *   accent   — фиолетовый акцент-градиент (МАКСИМУМ ОДНА на экран — обычно «Купить подписку»)
 *   secondary — surface + border (вторичное действие)
 *   ghost    — без фона
 *   danger   — красный
 *
 * Состояния: default / hover (подъём+тень) / active (scale 0.985) / disabled / loading.
 * Размеры sm / md / lg. На мобайле md и lg имеют min-h 44px (тач-таргет).
 *
 * Старая ui/button.tsx оставлена для legacy-экранов — не удаляю чтобы
 * не сломать dashboard/runs/seo и другие места, ещё не переехавшие на v2.
 */

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonV2Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonV2Size = 'sm' | 'md' | 'lg';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonV2Variant;
  size?: ButtonV2Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonV2Variant, string> = {
  primary:   'bg-brand-gradient text-white shadow-v2-sm hover:shadow-v2-hover',
  accent:    'bg-accent-gradient text-white shadow-v2-sm hover:shadow-v2-hover',
  secondary: 'bg-[hsl(var(--surface))] text-[hsl(var(--text))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-2))]',
  ghost:     'bg-transparent text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))]',
  danger:    'bg-[var(--signal-hot)] text-white hover:opacity-90',
};

const SIZE_STYLES: Record<ButtonV2Size, string> = {
  sm: 'h-8 px-3 text-[12px] rounded-v2-sm gap-1',
  md: 'min-h-11 sm:min-h-9 px-4 text-[13px] rounded-v2-sm gap-1.5',
  lg: 'min-h-11 px-5 text-[14px] rounded-v2 gap-2',
};

export const ButtonV2 = React.forwardRef<HTMLButtonElement, Props>(
  (
    { className, variant = 'primary', size = 'md', loading, iconLeft, iconRight, disabled, children, ...rest },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium whitespace-nowrap',
          'transition-[transform,box-shadow,background,color] duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
          'active:scale-[0.985]',
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className
        )}
        {...rest}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {iconLeft && <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{iconLeft}</span>}
            <span>{children}</span>
            {iconRight && <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{iconRight}</span>}
          </>
        )}
      </button>
    );
  }
);
ButtonV2.displayName = 'ButtonV2';
