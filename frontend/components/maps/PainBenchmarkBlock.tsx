'use client';

/**
 * Блок «Сравнение с нишей» (§1 ТЗ 2026-06-10) — вкладка «Жалобы» карточки компании:
 * профиль болей компании на фоне средних по нише и городу.
 *
 * Цвет по вердикту: хуже рынка — красный, на уровне — серый, лучше — зелёный.
 * Скрывается полностью, если у компании нет ниши или в выборке меньше 2 компаний.
 */

import { useEffect, useState } from 'react';
import { isUnnamedPainLabel } from '@/lib/painLabels';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

import { DrawerSection } from '@/components/maps/DrawerSection';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
    <DrawerSection
      title="Сравнение с нишей"
      aside={
        <span className="text-xs text-ui-text-muted">
          {data.niche}
          {cityLabel} · выборка {data.niche_companies_total}
        </span>
      }
    >
      <ul className="space-y-2">
        {data.items
          .filter((it) => !isUnnamedPainLabel(it.label))
          .slice(0, 8)
          .map((it) => {
            const tone: { bar: string; badge: BadgeTone; icon: React.ReactNode; label: string } =
              it.verdict === 'worse'
                ? {
                    bar: 'bg-ui-danger',
                    badge: 'danger',
                    icon: <TrendingUp />,
                    label: `×${it.ratio.toFixed(1)} хуже рынка`,
                  }
                : it.verdict === 'better'
                  ? {
                      bar: 'bg-ui-success',
                      badge: 'success',
                      icon: <TrendingDown />,
                      label:
                        it.ratio === 0
                          ? 'нет жалоб'
                          : `×${(1 / Math.max(0.01, it.ratio)).toFixed(1)} лучше рынка`,
                    }
                  : {
                      bar: 'bg-ui-text-muted/40',
                      badge: 'neutral',
                      icon: <Minus />,
                      label: 'на уровне рынка',
                    };
            // Шкала: ratio ограничен 3.0 для ширины полосы.
            const widthPct = Math.min(100, Math.max(6, (it.ratio / 3) * 100));
            return (
              <li
                key={it.pain_tag_id}
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-3"
                title={it.description ?? it.label}
              >
                <span className="truncate text-small text-ui-text">{it.label}</span>
                <span className="flex items-center gap-2">
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ui-surface-2">
                    <span
                      className={cn(
                        'block h-full rounded-full transition-[width] duration-300',
                        tone.bar,
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ui-text-muted">
                    {it.company_mentions} vs {it.niche_avg_per_company.toFixed(1)}
                  </span>
                </span>
                <Badge size="sm" tone={tone.badge} icon={tone.icon}>
                  {tone.label}
                </Badge>
              </li>
            );
          })}
      </ul>

      <p className="mt-3 text-xs text-ui-text-muted">
        Среднее число упоминаний темы на компанию в этой нише и городе. «×N хуже рынка» — готовый
        аргумент для холодного письма.
      </p>
    </DrawerSection>
  );
}
