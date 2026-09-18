import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge — единый бейдж кабинета (PR 3.3): статусы, сигналы, метки.
 * SignalPill и CSS-классы .app-badge* — его частные случаи.
 *
 * Тона: neutral · accent · success · warning · danger · info.
 * Цвет текста — из токенов PR 3.1, контраст на светлом фоне ≥ 4.5:1.
 */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--signal-muted-bg)] text-[color:var(--signal-muted)] ring-ui-border',
  accent: 'bg-ui-accent/10 text-ui-accent ring-ui-accent/20',
  success: 'bg-[var(--signal-good-bg)] text-[color:var(--signal-good)] ring-ui-success/25',
  warning: 'bg-[var(--signal-warm-bg)] text-[color:var(--signal-warm)] ring-ui-warning/25',
  danger: 'bg-[var(--signal-hot-bg)] text-[color:var(--signal-hot)] ring-ui-danger/25',
  info: 'bg-[var(--signal-cool-bg)] text-[color:var(--signal-cool)] ring-ui-info/25',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
}

export function Badge({
  tone = 'neutral',
  icon,
  size = 'md',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-pill text-xs font-medium leading-none ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {icon && (
        <span className="shrink-0 [&_svg]:h-3 [&_svg]:w-3" aria-hidden>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
