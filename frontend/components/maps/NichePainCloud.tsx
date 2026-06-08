'use client';

/**
 * Облако болей всей ниши на уровне поиска. Фишка ТЗ юзера 2026-06-08:
 *
 *   «Мебельные магазины СПб → 80% жалоб = "не привезли вовремя", 65% =
 *   "не хватает грузчиков", 50% = "низкое качество"»
 *
 * UI: горизонтальные бары с % частоты + 2 цитаты-доказательства снизу.
 * Сортировка по company_count DESC уже на бэке.
 *
 * Бэк: GET /api/v1/maps/search/{id}/pain-clusters.
 * Триггер пересчёта: POST /api/v1/maps/search/{id}/pain-clusters/refresh.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { apiClient } from '@/client';

interface PainClusterSampleQuote {
  quote: string;
  company_name?: string | null;
  posted_at?: string | null;
}

interface PainClusterOut {
  cluster_label: string;
  company_count: number;
  frequency_pct: number;
  total_mentions: number;
  pain_tag_ids: number[];
  sample_quotes: PainClusterSampleQuote[];
}

interface PainClustersResponse {
  search_id: number;
  niche: string;
  city: string | null;
  total_companies: number;
  clusters: PainClusterOut[];
  generated_at: string | null;
  status: 'ready' | 'pending' | 'empty';
}

export function NichePainCloud({ searchId, niche, city }: { searchId: number; niche: string; city: string | null | undefined }) {
  const [data, setData] = useState<PainClustersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get<PainClustersResponse>(
        `/maps/search/${searchId}/pain-clusters`,
      );
      setData(resp.data);
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось загрузить облако болей');
    } finally {
      setLoading(false);
    }
  }, [searchId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Авто-перепросмотр пока pending — каждые 15 секунд.
  useEffect(() => {
    if (data?.status !== 'pending') return;
    const t = setInterval(() => {
      void load();
    }, 15000);
    return () => clearInterval(t);
  }, [data?.status, load]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await apiClient.post(`/maps/search/${searchId}/pain-clusters/refresh`);
      // Дать таске немного времени и сразу же перепросить — бэк отдаст pending,
      // потом авто-poll каждые 15с подхватит готовое.
      setTimeout(() => void load(), 1500);
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось запустить пересчёт');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight text-[hsl(var(--text))]">
            Облако болей: {niche}
            {city ? ` — ${city}` : ''}
          </h3>
          <p className="text-[12px] text-[hsl(var(--muted))]">
            AI-агрегация жалоб клиентов по всем компаниям выдачи
            {data?.total_companies ? ` (${data.total_companies} компаний)` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className={'h-3.5 w-3.5 ' + (refreshing ? 'animate-spin' : '')} />
          Пересчитать
        </button>
      </div>

      {loading && !data && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
          Загружаем облако болей…
        </div>
      )}

      {error && (
        <div className="rounded-md bg-[var(--signal-hot-bg)] px-3 py-2 text-sm text-[color:var(--signal-hot)]">
          {error}
        </div>
      )}

      {data?.status === 'pending' && (
        <div className="rounded-md border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-3 py-3 text-sm text-[color:var(--signal-warm)]">
          AI ещё разбирает отзывы и строит кластеры. Обычно ~2 минуты после
          завершения поиска. Страница автоматически обновится.
        </div>
      )}

      {data?.status === 'empty' && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
          По этому поиску AI пока не выделил pain-теги. Это значит либо у компаний мало
          отзывов / нет негатива, либо AI ещё не успел разобрать. Нажми «Пересчитать»
          через минуту.
        </div>
      )}

      {data?.clusters && data.clusters.length > 0 && (
        <ul className="space-y-2.5">
          {data.clusters.map((c, idx) => (
            <li
              key={c.cluster_label}
              className="rounded-v2-sm border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3.5"
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden
                    className="inline-flex w-5 h-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      background: idx < 3 ? 'rgba(220, 38, 38, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                      color: idx < 3 ? '#dc2626' : '#475569',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span className="font-display font-semibold text-[14px] text-[hsl(var(--text))] truncate">
                    {c.cluster_label}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[18px] font-bold leading-none" style={{ color: '#dc2626' }}>
                    {c.frequency_pct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[hsl(var(--muted))] mt-0.5">
                    {c.company_count} комп. · {c.total_mentions} упом.
                  </div>
                </div>
              </div>
              {/* прогресс-бар */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--surface-2))]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, c.frequency_pct)}%`,
                    background:
                      c.frequency_pct >= 50
                        ? 'linear-gradient(90deg, #dc2626, #f59e0b)'
                        : c.frequency_pct >= 20
                        ? 'linear-gradient(90deg, #f59e0b, #facc15)'
                        : 'linear-gradient(90deg, #94a3b8, #cbd5e1)',
                  }}
                />
              </div>
              {/* цитаты */}
              {c.sample_quotes.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {c.sample_quotes.slice(0, 2).map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-2.5 py-1.5 text-[12px] text-[hsl(var(--text))]"
                    >
                      <span className="italic">«{q.quote}»</span>
                      {q.company_name && (
                        <span className="ml-1.5 text-[11px] text-[hsl(var(--muted))]">
                          — {q.company_name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {data?.generated_at && (
        <p className="text-[11px] text-[hsl(var(--muted))]">
          Обновлено: {new Date(data.generated_at).toLocaleString('ru-RU')}
        </p>
      )}
    </div>
  );
}
