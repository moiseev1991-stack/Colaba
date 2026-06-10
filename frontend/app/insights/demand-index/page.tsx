'use client';

/**
 * §4 ТЗ 2026-06-10. Индекс спроса — публичная сводка топ-болей клиентов
 * по нишам и городам. Контент-магнит для SEO + аналитический срез для
 * самого Димы. Никаких новых парсингов — только агрегат collected данных.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Info } from 'lucide-react';

import {
  getDemandIndex,
  listInsightsNiches,
  listMapCities,
  type DemandIndexOut,
  type InsightsNicheOut,
} from '@/src/services/api/maps';

export default function DemandIndexPage() {
  const [niches, setNiches] = useState<InsightsNicheOut[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [niche, setNiche] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [data, setData] = useState<DemandIndexOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listInsightsNiches().then((d) => {
      setNiches(d);
      if (!niche && d.length > 0) setNiche(d[0].niche);
    });
    void listMapCities().then(setCities).catch(() => setCities([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!niche) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDemandIndex(niche, city || null)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError('Не удалось загрузить индекс спроса');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [niche, city]);

  const maxMentions = useMemo(() => {
    if (!data || data.items.length === 0) return 1;
    return Math.max(1, data.items[0].total_mentions);
  }, [data]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight text-slate-900 dark:text-slate-100">
            Индекс спроса
          </h1>
          <div className="text-[12px] text-slate-500 dark:text-slate-400">
            Топ-боли клиентов по нишам и городам — на собранных данных
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <label className="text-[12px] text-slate-600 dark:text-slate-300">
          Ниша:{' '}
          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-[13px] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {niches.map((n) => (
              <option key={n.niche} value={n.niche}>
                {n.niche} · {n.companies_count}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-slate-600 dark:text-slate-300">
          Город:{' '}
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-[13px] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Все города</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <span className="ml-auto text-[12px] text-slate-500 dark:text-slate-400">
            Выборка: <b className="text-slate-700 dark:text-slate-200 tabular-nums">{data.companies_total}</b> компаний
          </span>
        )}
      </div>

      {loading && (
        <div className="rounded border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Считаю агрегат…
        </div>
      )}
      {error && !loading && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {!loading && data && data.note === 'small_sample' && (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{data.hint}</div>
        </div>
      )}

      {!loading && data && data.note === 'ok' && data.items.length === 0 && (
        <div className="rounded border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          В этой нише+городе ещё нет pain-тегов. Запусти AI-разбор болей в разделе
          «По картам».
        </div>
      )}

      {!loading && data && data.items.length > 0 && (
        <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <BarChart3 className="h-3 w-3" />
            Топ-боли клиентов · {data.niche}
            {data.city ? ` · ${data.city}` : ''}
          </div>
          <ul className="space-y-1.5">
            {data.items.map((it) => {
              const widthPct = Math.max(4, (it.total_mentions / maxMentions) * 100);
              return (
                <li
                  key={it.pain_tag_id}
                  className="flex items-center gap-3 rounded border border-slate-100 bg-slate-50/60 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-800/40"
                  title={it.description ?? it.label}
                >
                  <span className="min-w-0 flex-[3] truncate text-[13px] text-slate-800 dark:text-slate-100">
                    {it.label}
                  </span>
                  <div className="flex flex-[4] items-center gap-2">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full bg-rose-500 transition-[width] duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 tabular-nums text-[11.5px] text-slate-600 dark:text-slate-300">
                      {it.total_mentions} упом.
                    </span>
                  </div>
                  <span className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {it.companies_affected} комп. · {Math.round(it.share_of_companies * 100)}%
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            По уже собранным отзывам. Размер выборки показан честно — на малых
            данных (&lt;5 компаний) индекс скрывается. Алгоритм: суммарные
            упоминания pain-кластера, доля компаний с этой болью.
          </div>
        </div>
      )}
    </div>
  );
}
