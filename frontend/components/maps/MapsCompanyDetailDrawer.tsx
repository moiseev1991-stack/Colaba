'use client';

/**
 * Подробный диалог компании: метрики, сайт/телефон, отзывы (с фильтром по
 * тональности), pain-tags. Используется при клике на карточку из списка.
 *
 * Реализован поверх существующего Dialog (shadcn в проекте нет). При открытии
 * подтягивает CompanyDetailOut (карточка + 10 последних отзывов) и далее по
 * клику на табы — getCompanyReviews с sentiment-фильтром.
 */

import { useEffect, useState } from 'react';

import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  getCompanyDetail,
  getCompanyReviews,
  type CompanyDetailOut,
  type ReviewOut,
} from '@/src/services/api/maps';

type Tab = 'all' | 'negative' | 'positive';

interface Props {
  companyId: number | null;
  onClose: () => void;
}

export function MapsCompanyDetailDrawer({ companyId, onClose }: Props) {
  const [detail, setDetail] = useState<CompanyDetailOut | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [reviews, setReviews] = useState<ReviewOut[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (companyId == null) {
      setDetail(null);
      setReviews([]);
      setTab('all');
      return;
    }
    setIsLoading(true);
    void (async () => {
      try {
        const d = await getCompanyDetail(companyId);
        setDetail(d);
        setReviews(d.recent_reviews);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (companyId == null || !detail) return;
    if (tab === 'all') {
      setReviews(detail.recent_reviews);
      return;
    }
    setIsLoading(true);
    const sentiment: 'positive' | 'negative' = tab === 'negative' ? 'negative' : 'positive';
    void (async () => {
      try {
        const data = await getCompanyReviews(companyId, sentiment, 50, 0);
        setReviews(data.items);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tab, companyId, detail]);

  const open = companyId != null;

  return (
    <Dialog open={open} onClose={onClose} title={detail?.name ?? 'Загрузка…'}>
      {!detail ? (
        <div className="py-6 text-sm text-slate-500">Загружаем карточку…</div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-slate-600">{detail.address || '—'}</div>

          <div className="flex flex-wrap gap-3 text-sm">
            {detail.phone && (
              <a className="text-slate-700 underline" href={`tel:${detail.phone}`}>
                {detail.phone}
              </a>
            )}
            {detail.website && (
              <a
                className="text-slate-700 underline"
                href={detail.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                {detail.website}
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <Metric label="Рейтинг" value={detail.rating?.toFixed(1) ?? '—'} />
            <Metric label="Отзывов" value={String(detail.reviews_count)} />
            <Metric label="Негатив" value={String(detail.reviews_negative_count)} red />
            <Metric label="Позитив" value={String(detail.reviews_positive_count)} green />
            <Metric
              label="Ответы владельца"
              value={detail.has_owner_replies ? `да (${detail.owner_replies_count})` : 'нет'}
            />
          </div>

          {Array.isArray(detail.pain_tags) && detail.pain_tags.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Боли клиентов:</div>
              <div className="flex flex-wrap gap-1">
                {detail.pain_tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex gap-2 border-b border-slate-200">
              {(['all', 'negative', 'positive'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'border-b-2 px-2 py-1 text-xs font-medium transition-colors',
                    tab === t
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  )}
                >
                  {t === 'all' ? 'Все' : t === 'negative' ? 'Негатив' : 'Позитив'}
                </button>
              ))}
            </div>

            {isLoading && reviews.length === 0 ? (
              <div className="text-sm text-slate-500">Загружаем отзывы…</div>
            ) : reviews.length === 0 ? (
              <div className="text-sm text-slate-500">Отзывов нет.</div>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>{r.author_masked || 'Аноним'}</span>
                      {r.rating != null && <span>★ {r.rating}</span>}
                      {r.posted_at && (
                        <span>{new Date(r.posted_at).toLocaleDateString('ru-RU')}</span>
                      )}
                      {r.has_owner_reply && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                          ответ владельца
                        </span>
                      )}
                    </div>
                    {r.raw_text == null ? (
                      <div className="text-sm text-slate-400">
                        Текст удалён по политике хранения.{' '}
                        {r.source_url && (
                          <a
                            className="underline"
                            href={r.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Открыть оригинал
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm text-slate-700">
                        {r.raw_text}
                      </div>
                    )}
                    {Array.isArray(r.pain_tags) && r.pain_tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.pain_tags.map((t) => (
                          <span
                            key={t.id}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Metric({
  label,
  value,
  red,
  green,
}: {
  label: string;
  value: string;
  red?: boolean;
  green?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className={cn(
          'text-sm font-medium',
          red ? 'text-red-700' : green ? 'text-emerald-700' : 'text-slate-900'
        )}
      >
        {value}
      </div>
    </div>
  );
}
