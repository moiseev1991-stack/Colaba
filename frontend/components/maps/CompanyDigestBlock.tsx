'use client';

/**
 * Сводка отзывов компании за N дней — вкладка «Жалобы» карточки компании.
 *
 * Показывает агрегаты (тональность, рейтинг, ответы владельца) + главные боли,
 * плюс независимый блок «Самые резкие негативные отзывы за всё время».
 *
 * `days` приходит из карточки: юзер выбирает 30/90/полгода/год/«всё».
 * `null` = за всё время (бэк снимает фильтр по posted_at). Негатив за всё время
 * не зависит от `days` — чтобы у компаний без новых отзывов цитаты всё равно были.
 */

import { useEffect, useMemo, useState } from 'react';
import { isUnnamedPainLabel } from '@/lib/painLabels';
import { ExternalLink, Reply, Star, ThumbsDown, ThumbsUp } from 'lucide-react';

import { DrawerSection } from '@/components/maps/DrawerSection';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn, pluralRu } from '@/lib/utils';
import { getCompanyDigest, type CompanyDigestOut, type ReviewOut } from '@/src/services/api/maps';

type NegativeSourceFilter = 'all' | '2gis' | 'yandex_maps' | 'google';

type DaysOption = 30 | 90 | 180 | 365 | null;

// Segmented работает со строками: null («всё время») кодируем как 'all'.
const DAYS_OPTIONS: { value: string; days: DaysOption; label: string; title: string }[] = [
  { value: '30', days: 30, label: '30 дней', title: 'Отзывы за последние 30 дней' },
  { value: '90', days: 90, label: '90 дней', title: 'Отзывы за последние 90 дней' },
  { value: '180', days: 180, label: 'Полгода', title: 'Отзывы за полгода' },
  { value: '365', days: 365, label: 'Год', title: 'Отзывы за год' },
  { value: 'all', days: null, label: 'Всё', title: 'Все отзывы без фильтра по дате' },
];

interface Props {
  companyId: number;
  /** Окно сводки. `null` = за всё время. По умолчанию 30. */
  days?: DaysOption;
  /** Если передан — в шапке блока переключатель периода. */
  onDaysChange?: (days: DaysOption) => void;
  /** Юзер 2026-06-10: клик по боли → карточка включает фильтр отзывов и график. */
  onPainClick?: (painTagId: number, label: string) => void;
  /** Подсветка выбранной боли. */
  activePainTagId?: number | null;
}

function formatWindowLabel(days: number | null): string {
  if (days == null) return 'за всё время';
  if (days >= 365) return `за ${Math.round(days / 365)} г.`;
  if (days >= 60) return `за ${Math.round(days / 30)} мес.`;
  return `за ${days} дней`;
}

export function CompanyDigestBlock({
  companyId,
  days = 30,
  onDaysChange,
  onPainClick,
  activePainTagId,
}: Props) {
  const [data, setData] = useState<CompanyDigestOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCompanyDigest(companyId, days)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || 'Не удалось загрузить сводку');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, days]);

  // Пока грузится новое окно, показываем прежние данные — без мигания блока.
  const windowLabel = formatWindowLabel(data?.days ?? days);

  if (loading && !data) {
    return (
      <div aria-busy="true">
        <Skeleton className="h-36" rounded="md" />
        <span className="sr-only">Загрузка сводки {windowLabel}…</span>
      </div>
    );
  }
  if (error || !data) {
    return null; // тихо скрываем — это не критичный блок
  }

  const ownerPct = data.owner_reply_rate != null ? Math.round(data.owner_reply_rate * 100) : null;

  const negatives = data.top_negative_reviews_all_time ?? [];
  const hasNegatives = negatives.length > 0;
  // Какие источники реально встречаются среди негатива — для переключателя.
  const availableNegativeSources = computeAvailableSources(negatives);
  const pains = data.top_pains.filter((p) => !isUnnamedPainLabel(p.label)).slice(0, 3);

  return (
    <DrawerSection
      title={`Сводка ${windowLabel}`}
      aside={
        onDaysChange && (
          <Segmented
            aria-label="Период сводки"
            size="sm"
            disabled={loading}
            value={DAYS_OPTIONS.find((o) => o.days === (days ?? null))?.value ?? '30'}
            onChange={(v) => onDaysChange(DAYS_OPTIONS.find((o) => o.value === v)?.days ?? null)}
            options={DAYS_OPTIONS.map((o) => ({ value: o.value, label: o.label, title: o.title }))}
          />
        )
      }
    >
      <div className={cn('space-y-4 transition-opacity', loading && 'opacity-60')}>
        {data.total_reviews === 0 ? (
          <p className="rounded-card bg-ui-surface-2 px-3 py-2.5 text-small text-ui-text-muted">
            {days == null
              ? 'Отзывов за всё время не найдено.'
              : `Новых отзывов ${windowLabel} нет — выберите период длиннее.`}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DigestMetric
                icon={<ThumbsUp className="h-3.5 w-3.5 text-ui-success" />}
                label="Позитив"
                value={data.positive_count}
                tone="success"
              />
              <DigestMetric
                icon={<ThumbsDown className="h-3.5 w-3.5 text-ui-danger" />}
                label="Негатив"
                value={data.negative_count}
                tone="danger"
              />
              <DigestMetric
                icon={<Star className="h-3.5 w-3.5 text-signal-warm" />}
                label="Ср. рейтинг"
                value={data.avg_rating != null ? data.avg_rating.toFixed(2) : '—'}
                tone="neutral"
              />
              <DigestMetric
                icon={<Reply className="h-3.5 w-3.5 text-ui-text-muted" />}
                label="Отв. владельца"
                value={ownerPct != null ? `${ownerPct}%` : '—'}
                tone="neutral"
              />
            </div>

            {pains.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-small font-semibold text-ui-text">
                  Главные жалобы
                  {onPainClick && (
                    <span className="font-normal text-ui-text-muted">
                      {' '}
                      · нажмите — покажем динамику и отзывы
                    </span>
                  )}
                </h4>
                {pains.map((p) => {
                  const active = activePainTagId === p.pain_tag_id;
                  const inner = (
                    <>
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ui-text">
                          <span className="h-1.5 w-1.5 rounded-full bg-ui-danger" aria-hidden />
                          {p.label}
                        </span>
                        {p.mention_count > 0 && (
                          <span className="text-xs tabular-nums text-ui-text-muted">
                            {p.mention_count}{' '}
                            {pluralRu(p.mention_count, ['упоминание', 'упоминания', 'упоминаний'])}
                          </span>
                        )}
                      </span>
                      {p.top_quote && (
                        <span className="mt-1.5 block text-small italic leading-relaxed text-ui-text-muted">
                          «{p.top_quote}»
                        </span>
                      )}
                    </>
                  );
                  const cls = cn(
                    'block w-full rounded-card border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-ui-danger/50 bg-ui-danger/[.05]'
                      : 'border-ui-border bg-ui-surface',
                  );
                  return onPainClick ? (
                    <button
                      key={p.pain_tag_id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onPainClick(p.pain_tag_id, p.label)}
                      className={cn(cls, !active && 'hover:border-ui-danger/40')}
                      title={
                        active ? 'Нажмите ещё раз, чтобы снять тему' : 'Динамика и отзывы темы'
                      }
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={p.pain_tag_id} className={cls}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {hasNegatives && (
          <TopNegativeReviewsPreview
            reviews={negatives}
            availableSources={availableNegativeSources}
            // у компаний без свежих отзывов раздел становится главным
            emphasize={data.total_reviews === 0}
          />
        )}
      </div>
    </DrawerSection>
  );
}

function sourceLabel(source: string | null | undefined): string | null {
  if (source === '2gis') return '2GIS';
  if (source === 'yandex_maps') return 'Я.Карты';
  if (source === 'google') return 'Google';
  return null;
}

function computeAvailableSources(reviews: ReviewOut[]): NegativeSourceFilter[] {
  const set = new Set<NegativeSourceFilter>(['all']);
  for (const r of reviews) {
    if (r.source === '2gis' || r.source === 'yandex_maps' || r.source === 'google') {
      set.add(r.source as NegativeSourceFilter);
    }
  }
  return (['all', '2gis', 'yandex_maps', 'google'] as NegativeSourceFilter[]).filter((s) =>
    set.has(s),
  );
}

function TopNegativeReviewsPreview({
  reviews,
  availableSources,
  emphasize,
}: {
  reviews: ReviewOut[];
  availableSources: NegativeSourceFilter[];
  emphasize: boolean;
}) {
  // Юзер 2026-06-12: переключение между источниками внутри негатива.
  // Фильтр на клиенте — бэк отдал негативные отзывы за всё время.
  const [sourceFilter, setSourceFilter] = useState<NegativeSourceFilter>('all');
  const filtered = useMemo(
    () => (sourceFilter === 'all' ? reviews : reviews.filter((r) => r.source === sourceFilter)),
    [reviews, sourceFilter],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-small font-semibold text-ui-text">
          {emphasize
            ? 'Самые резкие негативные отзывы за всё время'
            : 'Резкий негатив за всё время'}
        </h4>
        {availableSources.length > 2 && (
          <Segmented<NegativeSourceFilter>
            aria-label="Источник негативных отзывов"
            size="sm"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={availableSources.map((src) => ({
              value: src,
              label: src === 'all' ? 'Все' : (sourceLabel(src) ?? src),
            }))}
          />
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-card bg-ui-surface-2 px-3 py-2 text-small text-ui-text-muted">
          Нет негативных отзывов из этого источника.
        </p>
      ) : (
        filtered.slice(0, 3).map((r) => <NegativeReviewSnippet key={r.id} review={r} />)
      )}
    </div>
  );
}

function NegativeReviewSnippet({ review }: { review: ReviewOut }) {
  const text = (review.raw_text || '').trim();
  const truncated = text.length > 220 ? text.slice(0, 220).trimEnd() + '…' : text;
  const date = review.posted_at ? formatShortDate(review.posted_at) : null;
  const srcLabel = sourceLabel(review.source);
  const href = review.source_url || null;

  // Юзер 2026-06-12: весь отзыв кликабелен — открывает оригинал в новой вкладке.
  const Outer: React.ElementType = href ? 'a' : 'div';
  const outerProps = href
    ? {
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Открыть оригинал отзыва в новой вкладке',
      }
    : {};

  return (
    <Outer
      {...outerProps}
      className={cn(
        'block rounded-card border border-ui-border bg-ui-surface px-3 py-2.5 transition-colors',
        href && 'hover:border-ui-danger/40',
      )}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ui-text-muted">
        {review.rating != null && (
          <span className="inline-flex items-center gap-0.5 font-semibold text-ui-danger">
            <Star className="h-3 w-3 fill-current" aria-hidden />
            {review.rating}/5
          </span>
        )}
        {srcLabel && <span>{srcLabel}</span>}
        {date && <span>· {date}</span>}
        {review.has_owner_reply && <span className="text-ui-success">· есть ответ владельца</span>}
        {href && (
          <span className="ml-auto inline-flex items-center gap-0.5 font-semibold">
            оригинал <ExternalLink className="h-3 w-3" aria-hidden />
          </span>
        )}
      </span>
      <span className="mt-1.5 block text-small italic leading-relaxed text-ui-text">
        «{truncated || 'текст отсутствует'}»
      </span>
    </Outer>
  );
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function DigestMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: 'success' | 'danger' | 'neutral';
}) {
  return (
    <div
      className={cn(
        'rounded-card px-3 py-2',
        tone === 'success'
          ? 'bg-ui-success/[.07]'
          : tone === 'danger'
            ? 'bg-ui-danger/[.06]'
            : 'bg-ui-surface-2',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-ui-text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-ui-text">{value}</div>
    </div>
  );
}
