'use client';

/**
 * Блок «Сравнение с нишей» (§1 ТЗ 2026-06-10) — drawer-секция, которая
 * показывает профиль болей компании на фоне средних по нише+городу.
 *
 * Pipedrive-стиль: лево/право две колонки (компания vs ниша), цветовая
 * семантика по verdict (rose=worse, slate=on_par, emerald=better).
 * Скрывается полностью, если у компании ниша пустая или в выборке <2 компаний.
 */

import { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

import { getCompanyPainBenchmark, type PainBenchmarkOut } from '@/src/services/api/maps';

interface Props {
  companyId: number;
}

export function PainBenchmarkBlock({ companyId }: Props) {
  const [data, setData] = useState<PainBenchmarkOut | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCompanyPainBenchmark(companyId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (loading) return null;
  if (!data || data.items.length === 0 || data.niche_companies_total < 2) return null;

  const cityLabel = data.city ? ` · ${data.city}` : '';

  return (
    <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Сравнение с нишей
        </span>
        <span className="rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {data.niche}{cityLabel}
        </span>
        <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
          выборка: {data.niche_companies_total} компаний
        </span>
      </div>

      <ul className="space-y-1.5">
        {data.items.slice(0, 8).map((it) => {
          const tone =
            it.verdict === 'worse'
              ? {
                  bar: 'bg-rose-500',
                  badge:
                    'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200',
                  icon: <TrendingUp className="h-3 w-3" />,
                  label: `×${it.ratio.toFixed(1)} хуже рынка`,
                }
              : it.verdict === 'better'
                ? {
                    bar: 'bg-emerald-500',
                    badge:
                      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200',
                    icon: <TrendingDown className="h-3 w-3" />,
                    label:
                      it.ratio === 0
                        ? 'нет жалоб'
                        : `×${(1 / Math.max(0.01, it.ratio)).toFixed(1)} лучше рынка`,
                  }
                : {
                    bar: 'bg-slate-400',
                    badge:
                      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                    icon: <Minus className="h-3 w-3" />,
                    label: 'на уровне рынка',
                  };
          // Шкала: ratio cap'нут на 3.0 для визуала bar-width.
          const widthPct = Math.min(100, Math.max(6, (it.ratio / 3) * 100));
          return (
            <li
              key={it.pain_tag_id}
              className="flex items-center gap-2"
              title={it.description ?? it.label}
            >
              <span className="min-w-0 flex-[2] truncate text-[12px] text-slate-800 dark:text-slate-100">
                {it.label}
              </span>
              <div className="flex flex-[3] items-center gap-1.5">
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full ${tone.bar} transition-[width] duration-500`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="shrink-0 tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                  {it.company_mentions} vs {it.niche_avg_per_company.toFixed(1)}
                </span>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${tone.badge}`}
              >
                {tone.icon}
                {tone.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 text-[10.5px] text-slate-500 dark:text-slate-400">
        Сравнение по среднему числу упоминаний боли на компанию в этой нише и
        городе. Используй «×N хуже рынка» как аргумент в холодном письме.
      </div>
    </div>
  );
}
