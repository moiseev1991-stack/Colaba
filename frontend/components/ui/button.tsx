'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Button — единственная кнопка кабинета (PR 3.3). Раньше их было три: ui/button (синяя),
 * ButtonV2 (градиент) и фиолетовая CTA шапки. ButtonV2 теперь реэкспорт этого компонента.
 *
 * Варианты: primary (главное действие) · secondary · ghost · danger.
 * Размеры: sm · md · icon. Старые имена (default, destructive, outline, accent, lg)
 * принимаются как синонимы, чтобы не переписывать существующие экраны.
 * Ссылка, которая выглядит как кнопка: <Link className={buttonClass({ variant, size })}>.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'icon';
type LegacyVariant = 'default' | 'destructive' | 'outline' | 'accent';
type LegacySize = 'default' | 'lg';

const VARIANT_ALIAS: Record<ButtonVariant | LegacyVariant, ButtonVariant> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
  default: 'primary',
  accent: 'primary',
  destructive: 'danger',
  outline: 'secondary',
};

const SIZE_ALIAS: Record<ButtonSize | LegacySize, ButtonSize> = {
  sm: 'sm',
  md: 'md',
  icon: 'icon',
  default: 'md',
  lg: 'md',
};

const BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40 focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ui-accent text-ui-accent-contrast hover:bg-ui-accent-hover',
  secondary: 'border border-ui-border bg-ui-surface text-ui-text hover:bg-ui-surface-2',
  ghost: 'bg-transparent text-ui-text hover:bg-ui-surface-2',
  danger: 'bg-ui-danger text-white hover:bg-ui-danger/90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small',
  // На телефоне 44px — удобная зона нажатия, с sm-брейкпоинта 36px.
  md: 'min-h-11 px-4 text-sm sm:min-h-9',
  icon: 'h-9 w-9 p-0',
};

export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant | LegacyVariant;
  size?: ButtonSize | LegacySize;
  className?: string;
} = {}) {
  return cn(BASE, VARIANTS[VARIANT_ALIAS[variant]], SIZES[SIZE_ALIAS[size]], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | LegacyVariant;
  size?: ButtonSize | LegacySize;
  /** Показывает спиннер и блокирует кнопку; текст остаётся на месте. */
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, iconLeft, iconRight, disabled, children, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        iconLeft && <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{iconLeft}</span>
      )}
      {children}
      {!loading && iconRight && <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{iconRight}</span>}
    </button>
  ),
);
Button.displayName = 'Button';
