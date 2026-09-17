import { cn } from '@/lib/utils';

/**
 * Столбики «отзывы по месяцам × источник» (вид Premium, 17.09).
 * Столбики — SVG, растянутый на ширину блока; подписи месяцев и легенда — обычный текст,
 * поэтому не сжимаются до нечитаемых на узком экране. Значение месяца — во всплывающей подсказке.
 */

export interface MonthlySourcePoint {
  /** 'YYYY-MM' */
  month: string;
  source: string;
  count: number;
}

const FILL: Record<string, string> = {
  '2gis': 'fill-signal-cool',
  yandex_maps: 'fill-signal-hot',
  google: 'fill-signal-warm',
};
const SWATCH: Record<string, string> = {
  '2gis': 'bg-signal-cool',
  yandex_maps: 'bg-signal-hot',
  google: 'bg-signal-warm',
};
const LABEL: Record<string, string> = {
  '2gis': '2GIS',
  yandex_maps: 'Я.Карты',
  google: 'Google',
};
const MONTHS_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/** 'YYYY-MM' → «мар» или «янв 26» (год — у первого месяца и у января). */
function monthLabel(month: string, withYear: boolean): string {
  const [y, m] = month.split('-');
  const name = MONTHS_RU[Number(m) - 1] ?? month;
  return withYear ? `${name} ${y?.slice(2) ?? ''}`.trim() : name;
}

export function MonthlySourceBars({
  points,
  ariaLabel,
  className,
  maxLabels = 8,
}: {
  points: MonthlySourcePoint[];
  ariaLabel: string;
  className?: string;
  /** Сколько подписей месяцев показывать максимум — подписываем каждый N-й месяц. */
  maxLabels?: number;
}) {
  const byMonth = new Map<string, Record<string, number>>();
  for (const p of points) {
    const row = byMonth.get(p.month) ?? {};
    row[p.source] = (row[p.source] ?? 0) + p.count;
    byMonth.set(p.month, row);
  }
  const months = Array.from(byMonth.keys()).sort();
  const sources = Array.from(new Set(points.map((p) => p.source)));
  const maxCount = Math.max(1, ...months.flatMap((m) => Object.values(byMonth.get(m) ?? {})));
  if (months.length === 0) return null;

  // Каждый месяц — 100 единиц ширины; столбики занимают до 70% группы и центрированы в ней,
  // чтобы подпись месяца в текстовой сетке ниже стояла ровно под ними.
  const GROUP = 100;
  const barW = Math.min(28, 70 / Math.max(1, sources.length));
  const offset = (GROUP - barW * sources.length) / 2;
  const step = Math.max(1, Math.ceil(months.length / maxLabels));

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-xs tabular-nums text-ui-text-muted">
        <span>до {maxCount} в месяц</span>
      </div>
      <svg
        viewBox={`0 0 ${GROUP * months.length} 100`}
        preserveAspectRatio="none"
        className="mt-1 block h-28 w-full border-b border-ui-border"
        role="img"
        aria-label={ariaLabel}
      >
        {months.map((m, mi) => {
          const row = byMonth.get(m) ?? {};
          return (
            <g key={m}>
              {sources.map((src, si) => {
                const count = row[src] ?? 0;
                const h = (count / maxCount) * 96;
                return (
                  <rect
                    key={src}
                    x={mi * GROUP + offset + si * barW}
                    y={100 - h}
                    width={Math.max(1, barW - 2)}
                    height={h}
                    className={FILL[src] ?? 'fill-signal-muted'}
                  >
                    <title>
                      {monthLabel(m, true)} · {LABEL[src] ?? src} · {count}
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div
        className="mt-1 grid text-center text-xs tabular-nums text-ui-text-muted"
        style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {months.map((m, mi) => (
          <span key={m} className="whitespace-nowrap">
            {mi % step === 0 ? monthLabel(m, mi === 0 || m.endsWith('-01')) : ''}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ui-text-muted">
        {sources.map((src) => (
          <span key={src} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn('h-2 w-2 rounded-sm', SWATCH[src] ?? 'bg-signal-muted')}
            />
            {LABEL[src] ?? src}
          </span>
        ))}
      </div>
    </div>
  );
}
