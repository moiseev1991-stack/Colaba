'use client';

/**
 * §3 ТЗ 2026-06-10. Компактный badge тренда негатива в drawer-е компании.
 *
 * Считается отношение negativов за последние 30 дней к 30-60 дням до этого.
 * rising — горячий лид (писать сейчас, проблема свежая).
 * falling — компания подтянулась.
 * stable / no_data — нейтрально.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { getCompanyNegativeTrend, type NegativeTrendOut } from '@/src/services/api/maps';

interface Props {
  companyId: number;
}

export function NegativeTrendBadge({ companyId }: Props) {
  const [data, setData] = useState<NegativeTrendOut | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCompanyNegativeTrend(companyId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!data || data.verdict === 'no_data') return null;

  const view =
    data.verdict === 'rising'
      ? {
          cls: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200',
          icon: <TrendingUp className="h-3 w-3" />,
          label: 'Негатив растёт',
          hint: `За последние 30 дней — ${data.last_30d}, было ${data.prev_30d}. Горячий лид: проблема свежая, повод писать сейчас.`,
        }
      : data.verdict === 'falling'
        ? {
            cls: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200',
            icon: <TrendingDown className="h-3 w-3" />,
            label: 'Негатив уходит',
            hint: `Последние 30 дней — ${data.last_30d}, было ${data.prev_30d}. Компания справилась с потоком жалоб.`,
          }
        : {
            cls: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
            icon: <Minus className="h-3 w-3" />,
            label: 'Негатив стабилен',
            hint: `30 дн.: ${data.last_30d} · 30-60 дн.: ${data.prev_30d} · 60-90 дн.: ${data.prev_60d}.`,
          };

  return (
    <span
      title={view.hint}
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11.5px] font-medium ${view.cls}`}
    >
      {view.icon}
      {view.label}
      <span className="ml-1 tabular-nums opacity-80">
        {data.last_30d} / {data.prev_30d}
      </span>
    </span>
  );
}
