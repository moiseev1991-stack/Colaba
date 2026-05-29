'use client';

/**
 * Блок дайджеста отзывов компании за N дней — в drawer'е.
 *
 * Показывает агрегаты (sentiment, рейтинг, ответы владельца) + топ-боли.
 * Это «приборная панель» для принятия решения «брать ли в outreach».
 */

import { useEffect, useState } from 'react';
import { MessageSquareQuote, ThumbsDown, ThumbsUp, Reply, Star } from 'lucide-react';

import { getCompanyDigest, type CompanyDigestOut } from '@/src/services/api/maps';

interface Props {
  companyId: number;
  days?: number;
}

export function CompanyDigestBlock({ companyId, days = 30 }: Props) {
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

  if (loading) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Загружаю сводку за {days} дней…
      </div>
    );
  }
  if (error || !data) {
    return null; // тихо скрываем — это не критичный блок
  }
  if (data.total_reviews === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        За {data.days} дней новых отзывов нет.
      </div>
    );
  }

  const ownerPct =
    data.owner_reply_rate != null ? Math.round(data.owner_reply_rate * 100) : null;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Сводка за {data.days} дней
        </div>
        <div className="text-[11px] text-slate-500">{data.total_reviews} отзывов</div>
      </div>

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
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Топ-боли клиентов
          </div>
          {data.top_pains.slice(0, 3).map((p) => (
            <div
              key={p.pain_tag_id}
              className="rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  {p.label}
                </span>
                {p.mention_count > 0 && (
                  <span className="text-[11px] text-amber-700/80">× {p.mention_count}</span>
                )}
              </div>
              {p.top_quote && (
                <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-700">
                  <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <span className="italic">«{p.top_quote}»</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
    success: 'bg-emerald-50 ring-emerald-200',
    danger: 'bg-red-50 ring-red-200',
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
