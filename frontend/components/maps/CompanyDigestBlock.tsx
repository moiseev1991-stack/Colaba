'use client';

/**
 * Блок дайджеста отзывов компании за N дней — в drawer'е.
 *
 * Показывает агрегаты (sentiment, рейтинг, ответы владельца) + топ-боли,
 * плюс независимый блок «Самые яркие негативные отзывы за всё время».
 *
 * `days` controlled из drawer'а: юзер кликает 30/90/полгода/год/«всё»,
 * drawer передаёт значение сюда. `null` = за всё время (бэк снимает
 * фильтр по posted_at). Превью негатива не зависит от `days` —
 * чтобы у компаний без новых отзывов цитаты всё равно показывались.
 */

import { useEffect, useState } from 'react';
import { MessageSquareQuote, ThumbsDown, ThumbsUp, Reply, Star } from 'lucide-react';

import { getCompanyDigest, type CompanyDigestOut, type ReviewOut } from '@/src/services/api/maps';

type DaysOption = 30 | 90 | 180 | 365 | null;

const DAYS_OPTIONS: { value: DaysOption; label: string }[] = [
  { value: 30, label: '30д' },
  { value: 90, label: '90д' },
  { value: 180, label: 'Полгода' },
  { value: 365, label: 'Год' },
  { value: null, label: 'Всё' },
];

interface Props {
  companyId: number;
  /** Окно дайджеста. `null` = за всё время. По умолчанию 30. */
  days?: DaysOption;
  /** Если передан — рендерим toggle переключатель в шапке блока. */
  onDaysChange?: (days: DaysOption) => void;
  /** Юзер 2026-06-10: клик по плитке боли → drawer выставляет
   *  activePainTagId (фильтр reviews + chart-блок). */
  onPainClick?: (painTagId: number, label: string) => void;
  /** Подсветка активной плитки. */
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

  // На время загрузки показываем плейсхолдер, но если есть данные —
  // продолжаем рендерить блок (быстрая визуальная реакция на смену окна).
  const windowLabel = formatWindowLabel(data?.days ?? days);

  if (loading && !data) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Загружаю сводку {windowLabel}…
      </div>
    );
  }
  if (error || !data) {
    return null; // тихо скрываем — это не критичный блок
  }

  const ownerPct =
    data.owner_reply_rate != null ? Math.round(data.owner_reply_rate * 100) : null;

  const negatives = data.top_negative_reviews_all_time ?? [];
  const hasNegatives = negatives.length > 0;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Сводка {windowLabel}
        </div>
        <div className="flex items-center gap-2">
          {data.total_reviews > 0 && (
            <div className="text-[11px] text-slate-500">
              {data.total_reviews} отзыв(ов)
            </div>
          )}
          {onDaysChange && (
            <DaysRangeToggle
              value={days ?? null}
              onChange={onDaysChange}
              disabled={loading}
            />
          )}
        </div>
      </div>

      {data.total_reviews === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {days == null
            ? 'Отзывов за всё время не найдено.'
            : `${windowLabel} новых отзывов нет — попробуй расширить окно.`}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DigestMetric
              icon={<ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />}
              label="Позитив"
              value={data.positive_count}
              tone="success"
            />
            <DigestMetric
              icon={<ThumbsDown className="h-3.5 w-3.5 text-red-600" />}
              label="Негатив"
              value={data.negative_count}
              tone="danger"
            />
            <DigestMetric
              icon={<Star className="h-3.5 w-3.5 text-amber-500" />}
              label="Ср. рейтинг"
              value={data.avg_rating != null ? data.avg_rating.toFixed(2) : '—'}
              tone="neutral"
            />
            <DigestMetric
              icon={<Reply className="h-3.5 w-3.5 text-slate-500" />}
              label="Отв. владельца"
              value={ownerPct != null ? `${ownerPct}%` : '—'}
              tone="neutral"
            />
          </div>

          {data.top_pains.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Топ-боли клиентов · клик = отзывы темы
                </div>
                {activePainTagId != null && onPainClick && (
                  <button
                    type="button"
                    onClick={() => onPainClick(-1, '')}
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    × снять
                  </button>
                )}
              </div>
              {data.top_pains.slice(0, 3).map((p) => {
                const active = activePainTagId === p.pain_tag_id;
                const clickable = !!onPainClick;
                const baseCls =
                  'block w-full text-left rounded border px-2 py-1.5 transition-colors';
                const stateCls = active
                  ? 'border-rose-500 bg-rose-50 dark:border-rose-400 dark:bg-rose-900/30'
                  : 'border-amber-300 bg-amber-50/70 hover:border-rose-400 hover:bg-rose-50/40 dark:border-amber-700/60 dark:bg-amber-900/20';
                const Inner = (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11.5px] font-medium ' +
                          (active
                            ? 'border-rose-500 bg-white text-rose-900 dark:bg-slate-900 dark:text-rose-100'
                            : 'border-amber-300 bg-white text-amber-900 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100')
                        }
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
                        {p.label}
                      </span>
                      {p.mention_count > 0 && (
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">
                          × {p.mention_count}
                        </span>
                      )}
                    </div>
                    {p.top_quote && (
                      <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-700 dark:text-slate-200">
                        <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                        <span className="italic">«{p.top_quote}»</span>
                      </div>
                    )}
                  </>
                );
                return clickable ? (
                  <button
                    key={p.pain_tag_id}
                    type="button"
                    onClick={() => onPainClick!(p.pain_tag_id, p.label)}
                    className={baseCls + ' ' + stateCls + ' cursor-pointer'}
                    title={
                      active
                        ? 'Клик ещё раз — снять фильтр'
                        : 'Открыть отзывы этой темы + chart динамики'
                    }
                  >
                    {Inner}
                  </button>
                ) : (
                  <div key={p.pain_tag_id} className={baseCls + ' ' + stateCls}>
                    {Inner}
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
          // у компаний без свежих отзывов раздел становится главным
          emphasize={data.total_reviews === 0}
        />
      )}
    </div>
  );
}

function DaysRangeToggle({
  value,
  onChange,
  disabled,
}: {
  value: DaysOption;
  onChange: (v: DaysOption) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10.5px] font-medium">
      {DAYS_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={
              'rounded px-1.5 py-0.5 transition-colors ' +
              (active
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700')
            }
            title={
              opt.value == null
                ? 'Считать по всем отзывам без фильтра по дате'
                : `Окно ${opt.label}`
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function TopNegativeReviewsPreview({
  reviews,
  emphasize,
}: {
  reviews: ReviewOut[];
  emphasize: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {emphasize
          ? 'Самые яркие негативные отзывы (за всё время)'
          : 'Топ-негатив за всё время'}
      </div>
      <div className="space-y-1.5">
        {reviews.slice(0, 3).map((r) => (
          <NegativeReviewSnippet key={r.id} review={r} />
        ))}
      </div>
    </div>
  );
}

function NegativeReviewSnippet({ review }: { review: ReviewOut }) {
  const text = (review.raw_text || '').trim();
  const truncated =
    text.length > 220 ? text.slice(0, 220).trimEnd() + '…' : text;
  const date = review.posted_at ? formatShortDate(review.posted_at) : null;
  const sourceLabel =
    review.source === '2gis'
      ? '2GIS'
      : review.source === 'yandex_maps'
      ? 'Я.Карты'
      : review.source === 'google'
      ? 'Google'
      : null;

  return (
    <div className="rounded border border-rose-200 bg-rose-50/50 px-2 py-1.5 dark:border-rose-900/60 dark:bg-rose-900/20">
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-500">
        {review.rating != null && (
          <span className="inline-flex items-center gap-0.5 font-medium text-rose-700 dark:text-rose-300">
            <Star className="h-3 w-3 fill-current" />
            {review.rating}/5
          </span>
        )}
        {sourceLabel && (
          <span className="rounded bg-slate-100 px-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {sourceLabel}
          </span>
        )}
        {date && <span>· {date}</span>}
        {review.has_owner_reply && (
          <span className="text-emerald-700 dark:text-emerald-400">
            · есть ответ владельца
          </span>
        )}
      </div>
      <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-700 dark:text-slate-200">
        <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
        <span className="italic">«{truncated || '(текст отсутствует)'}»</span>
      </div>
    </div>
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
  const bg = {
    success: 'bg-[var(--signal-good-bg)] ring-[color:var(--signal-good)]/30',
    danger: 'bg-[var(--signal-hot-bg)] ring-[color:var(--signal-hot)]/30',
    neutral: 'bg-slate-50 ring-slate-200',
  }[tone];
  return (
    <div className={`rounded-md px-2 py-1.5 ring-1 ring-inset ${bg}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
