'use client';

/**
 * Шапка-блок «Сравнение с нишей» поверх списка компаний.
 * В отличие от drawer-версии PainBenchmarkBlock — без привязки к конкретной
 * компании. Показывает топ-болей ниши+города с метриками:
 *   - companies_affected — у скольки компаний эта боль упоминается
 *   - share_of_companies — доля
 *   - niche_avg_per_company — среднее упоминаний на компанию
 *
 * Бар-шкала строится по share_of_companies (0..100%).
 * Скрывается при выборке <5 компаний или пустом items.
 */

import { useEffect, useState } from 'react';

import { getDemandIndex, type DemandIndexOut } from '@/src/services/api/maps';

interface Props {
  niche: string;
  city: string | null;
  /** Опциональный клик по строке — фильтрует список компаний по pain_tag_id. */
  onPainClick?: (painTagId: number) => void;
  /** Текущие активные pain_tag_ids — для подсветки строк. */
  activePainTagIds?: number[];
  /** 2026-06-16: 'negative' (default) = боли клиентов; 'positive' = сильные стороны. */
  sentiment?: 'negative' | 'positive';
}

export function NicheBenchmarkOverviewBlock({
  niche,
  city,
  onPainClick,
  activePainTagIds,
  sentiment = 'negative',
}: Props) {
  const [data, setData] = useState<DemandIndexOut | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDemandIndex(niche, city, sentiment)
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
  }, [niche, city, sentiment]);

  if (loading) return null;
  if (
    !data ||
    !Array.isArray(data.items) ||
    data.items.length === 0 ||
    data.note === 'small_sample'
  ) return null;

  const cityLabel = data.city ? ` · ${data.city}` : '';
  const top = data.items.slice(0, 6);
  const active = new Set(activePainTagIds ?? []);
  const companiesTotal = data.companies_total ?? 0;

  return (
    <div className="mt-2 rounded border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {sentiment === 'positive'
            ? 'Сравнение с нишей · сильные стороны'
            : 'Сравнение с нишей · боли'}
        </span>
        <span className="rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {data.niche}{cityLabel}
        </span>
        <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
          выборка: {data.companies_total} компаний
        </span>
      </div>

      <ul className="space-y-1">
        {top.map((it) => {
          const share = typeof it.share_of_companies === 'number' ? it.share_of_companies : 0;
          const avgPerCompany = typeof it.niche_avg_per_company === 'number'
            ? it.niche_avg_per_company
            : 0;
          const affected = typeof it.companies_affected === 'number' ? it.companies_affected : 0;
          const sharePct = Math.round(share * 100);
          const widthPct = Math.min(100, Math.max(6, sharePct));
          const isActive = active.has(it.pain_tag_id);
          const clickable = !!onPainClick;
          const row = (
            <>
              <span className="min-w-0 flex-[2] truncate text-[11.5px] text-slate-800 dark:text-slate-100">
                {it.label}
              </span>
              <div className="flex flex-[3] items-center gap-1.5">
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={
                      'h-full transition-[width] duration-500 ' +
                      (isActive ? 'bg-rose-600' : 'bg-rose-500')
                    }
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="shrink-0 tabular-nums text-[10.5px] text-slate-500 dark:text-slate-400">
                  {sharePct}%
                </span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {affected}/{companiesTotal} комп.
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                ср. {avgPerCompany.toFixed(1)}
              </span>
            </>
          );
          return clickable ? (
            <li key={it.pain_tag_id}>
              <button
                type="button"
                onClick={() => onPainClick!(it.pain_tag_id)}
                title={it.description ?? `Показать только компании с болью «${it.label}»`}
                className={
                  'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors ' +
                  (isActive
                    ? 'bg-rose-50/70 dark:bg-rose-900/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60')
                }
              >
                {row}
              </button>
            </li>
          ) : (
            <li
              key={it.pain_tag_id}
              className="flex items-center gap-2 px-1 py-0.5"
              title={it.description ?? it.label}
            >
              {row}
            </li>
          );
        })}
      </ul>

      <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        Бар = доля компаний ниши, у которых эта боль упоминается. Среднее — упоминаний на компанию.
      </div>
    </div>
  );
}
