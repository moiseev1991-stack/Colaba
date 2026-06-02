'use client';

/**
 * SignalPill — единая сигнальная пилюля для всех бейджей-данных карточки.
 * §3 ТЗ редизайна 2026-06-03.
 *
 * Tone:
 *   hot   — критично / горячий лид / негатив
 *   warm  — внимание / нет ответа
 *   cool  — инфо / нейтрально / нет сайта (когда подсветить как горячий сигнал — accent)
 *   good  — успех / отвечает владелец
 *   muted — нет данных
 *   accent — фирменный градиент (для главного сигнала «нужен сайт»)
 *
 * Полупрозрачный фон в тоне + насыщенный текст/иконка. Иконка lucide слева.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export type SignalTone = 'hot' | 'warm' | 'cool' | 'good' | 'muted' | 'accent';

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: SignalTone;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
}

const TONE_STYLES: Record<SignalTone, string> = {
  hot:    'bg-[var(--signal-hot-bg)]   text-[color:var(--signal-hot)]   ring-1 ring-inset ring-red-200/60 dark:ring-red-500/30',
  warm:   'bg-[var(--signal-warm-bg)]  text-[color:var(--signal-warm)]  ring-1 ring-inset ring-amber-200/60 dark:ring-amber-500/30',
  cool:   'bg-[var(--signal-cool-bg)]  text-[color:var(--signal-cool)]  ring-1 ring-inset ring-blue-200/60 dark:ring-blue-500/30',
  good:   'bg-[var(--signal-good-bg)]  text-[color:var(--signal-good)]  ring-1 ring-inset ring-emerald-200/60 dark:ring-emerald-500/30',
  muted:  'bg-[var(--signal-muted-bg)] text-[color:var(--signal-muted)] ring-1 ring-inset ring-slate-200/60 dark:ring-slate-500/30',
  accent: 'bg-brand-gradient text-white shadow-v2-sm',
};

export function SignalPill({
  tone = 'muted',
  icon,
  size = 'md',
  className,
  children,
  ...rest
}: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill font-medium leading-none whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]',
        TONE_STYLES[tone],
        className
      )}
      {...rest}
    >
      {icon && <span className="shrink-0 [&_svg]:h-3 [&_svg]:w-3">{icon}</span>}
      {children}
    </span>
  );
}
