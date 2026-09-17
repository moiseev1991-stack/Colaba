'use client';

/**
 * «Сравнение с нишей» в сводке над выдачей (вид Premium, 17.09).
 * В отличие от PainBenchmarkBlock в карточке — без привязки к компании: топ тем
 * ниши и города с метриками:
 *   - companies_affected — у скольких компаний тема упоминается;
 *   - share_of_companies — доля (по ней строится полоса, 0..100%);
 *   - niche_avg_per_company — среднее упоминаний на компанию.
 * Скрывается при малой выборке или пустом списке.
 */

import { useEffect, useState } from 'react';
import { isUnnamedPainLabel } from '@/lib/painLabels';

import { cn } from '@/lib/utils';
import { getDemandIndex, type DemandIndexOut } from '@/src/services/api/maps';

interface Props {
  niche: string;
  city: string | null;
  /** Клик по строке — фильтрует список компаний по pain_tag_id. */
  onPainClick?: (painTagId: number) => void;
  /** Текущие активные pain_tag_ids — для подсветки строк. */
  activePainTagIds?: number[];
  /** 2026-06-16: 'negative' (по умолчанию) — жалобы; 'positive' — сильные стороны. */
  sentiment?: 'negative' | 'positive';
  className?: string;
}

export function NicheBenchmarkOverviewBlock({
  niche,
  city,
  onPainClick,
  activePainTagIds,
  sentiment = 'negative',
  className,
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
  )
    return null;

  const top = data.items.filter((it) => !isUnnamedPainLabel(it.label)).slice(0, 6);
  const active = new Set(activePainTagIds ?? []);
  const companiesTotal = data.companies_total ?? 0;
  const positive = sentiment === 'positive';

  return (
    <section aria-label="Сравнение с нишей" className={className}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-ui-text">Сравнение с нишей</h3>
        <span className="text-small text-ui-text-muted">
          доля компаний, у которых {positive ? 'хвалят' : 'жалуются'} · выборка {companiesTotal}
        </span>
      </div>

      <ul className="space-y-0.5">
        {top.map((it) => {
          const share = typeof it.share_of_companies === 'number' ? it.share_of_companies : 0;
          const avgPerCompany =
            typeof it.niche_avg_per_company === 'number' ? it.niche_avg_per_company : 0;
          const affected = typeof it.companies_affected === 'number' ? it.companies_affected : 0;
          const sharePct = Math.round(share * 100);
          const widthPct = Math.min(100, Math.max(4, sharePct));
          const isActive = active.has(it.pain_tag_id);
          const row = (
            <>
              <span className="min-w-0 truncate text-small font-medium text-ui-text">
                {it.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ui-surface-2">
                  <span
                    className={cn(
                      'block h-full rounded-full transition-[width] duration-300',
                      positive ? 'bg-ui-success' : 'bg-ui-danger',
                      !isActive && 'opacity-70',
                    )}
                    style={{ width: `${widthPct}%` }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right text-small font-semibold tabular-nums text-ui-text">
                  {sharePct}%
                </span>
              </span>
              <span
                className="hidden whitespace-nowrap text-right text-xs tabular-nums text-ui-text-muted sm:block"
                title="Компаний с темой из выборки · среднее упоминаний на компанию"
              >
                {affected}/{companiesTotal} · ср. {avgPerCompany.toFixed(1)}
              </span>
            </>
          );
          const grid =
            'grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-3 rounded-control px-2 py-1.5 text-left sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]';
          return onPainClick ? (
            <li key={it.pain_tag_id}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onPainClick(it.pain_tag_id)}
                title={it.description ?? `Показать только компании с темой «${it.label}»`}
                className={cn(
                  grid,
                  'transition-colors',
                  isActive
                    ? positive
                      ? 'bg-ui-success/[.08]'
                      : 'bg-ui-danger/[.06]'
                    : 'hover:bg-ui-surface-2',
                )}
              >
                {row}
              </button>
            </li>
          ) : (
            <li key={it.pain_tag_id} className={grid} title={it.description ?? it.label}>
              {row}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 px-2 text-xs text-ui-text-muted">
        Полоса — доля компаний ниши с этой темой; справа — сколько компаний и среднее упоминаний на
        компанию.
      </p>
    </section>
  );
}
