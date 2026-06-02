'use client';

/**
 * MetricCard — карточка метрики для дашборда (§3, §4.2 ТЗ редизайна 2026-06-03).
 *
 * Крупное display-число, лейбл-caption, опц. дельта со стрелкой и сигнал-цветом.
 * Адаптивна: на мобиле меньше, на десктопе крупно. Замена унылым «текст + цифра»
 * метрикам текущего дашборда.
 */

import * as React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardV2 } from './CardV2';

interface Props {
  label: string;
  value: React.ReactNode;
  /** Дельта в процентах (или абс). Положительное — рост, отрицательное — падение. */
  delta?: number;
  /** Подсказка к дельте: «vs прошлая неделя». */
  deltaLabel?: string;
  /** «Хорошее» направление — для метрик «ошибки» рост дельты = плохо. */
  goodDirection?: 'up' | 'down';
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({ label, value, delta, deltaLabel, goodDirection = 'up', icon, className }: Props) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const isPositive = hasDelta && delta! > 0;
  const isNegative = hasDelta && delta! < 0;
  // Цвет дельты с учётом goodDirection (для «ошибок» рост = плохо).
  const goodTone = goodDirection === 'down'
    ? (isPositive ? 'text-[color:var(--signal-hot)]' : 'text-[color:var(--signal-good)]')
    : (isPositive ? 'text-[color:var(--signal-good)]' : 'text-[color:var(--signal-hot)]');

  return (
    <CardV2 className={cn('flex flex-col gap-2 p-4 md:p-5', className)}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
          {label}
        </div>
        {icon && (
          <div className="rounded-v2-sm bg-brand-50 p-1.5 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            {icon}
          </div>
        )}
      </div>
      <div className="font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-none tracking-tight text-[hsl(var(--text))]">
        {value}
      </div>
      {hasDelta && (
        <div className={cn('flex items-center gap-1 text-[12px] font-medium', goodTone)}>
          {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : isNegative ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
          <span>
            {isPositive ? '+' : ''}{delta}%
          </span>
          {deltaLabel && <span className="text-[hsl(var(--muted))] font-normal">{deltaLabel}</span>}
        </div>
      )}
    </CardV2>
  );
}
