'use client';

/**
 * §3 ТЗ 2026-06-10. Бейдж тренда негатива в шапке карточки компании.
 *
 * Сравнивает негатив за последние 30 дней с 30–60 днями до этого.
 * rising — горячий лид (писать сейчас, проблема свежая).
 * falling — компания подтянулась.
 * stable / no_data — нейтрально.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
          tone: 'danger' as const,
          icon: <TrendingUp />,
          label: 'Негатив растёт',
          hint: `За последние 30 дней — ${data.last_30d}, было ${data.prev_30d}. Горячий лид: проблема свежая, повод писать сейчас.`,
        }
      : data.verdict === 'falling'
        ? {
            tone: 'success' as const,
            icon: <TrendingDown />,
            label: 'Негатив уходит',
            hint: `Последние 30 дней — ${data.last_30d}, было ${data.prev_30d}. Компания справилась с потоком жалоб.`,
          }
        : {
            tone: 'neutral' as const,
            icon: <Minus />,
            label: 'Негатив стабилен',
            hint: `30 дн.: ${data.last_30d} · 30–60 дн.: ${data.prev_30d} · 60–90 дн.: ${data.prev_60d}.`,
          };

  return (
    <Badge tone={view.tone} icon={view.icon} title={view.hint}>
      {view.label}
      <span className="ml-1 tabular-nums opacity-80">
        {data.last_30d} / {data.prev_30d}
      </span>
    </Badge>
  );
}
