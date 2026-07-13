'use client';

/**
 * /app/admin/data-inventory — таблица «что вообще есть в БД».
 *
 * Для каждой пары (ниша, город): companies_count, reviews_count,
 * reviews_analyzed (с embedding), pain_tags_count, companies_with_pain_scores.
 * Сортировка по companies_count desc.
 *
 * Только для суперюзера. Backend: GET /maps/admin/data-inventory.
 */

import { useEffect, useMemo, useState } from 'react';

interface InventoryItem {
  niche: string;
  city: string;
  companies_count: number;
  reviews_count: number;
  reviews_analyzed: number;
  pain_tags_count: number;
  companies_with_pain_scores: number;
}

interface InventoryResponse {
  total_pairs: number;
  total_companies: number;
  total_reviews: number;
  total_pain_tags: number;
  items: InventoryItem[];
}

export default function DataInventoryPage() {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v1/maps/admin/data-inventory', {
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(`HTTP ${res.status}: ${body?.detail ?? 'см. консоль'}`);
        }
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    if (!query) return data.items;
    return data.items.filter(
      (i) =>
        i.niche.toLowerCase().includes(query) ||
        i.city.toLowerCase().includes(query),
    );
  }, [data, q]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-6 pt-4 sm:pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Data inventory (admin)</h1>
        <p className="text-sm text-slate-500">
          Что реально есть в БД: сколько компаний, отзывов и AI-тегов по каждой (ниша, город).
          Помогает понять с чем можно работать сейчас, а где ещё нужно парсить.
        </p>
      </header>

      {loading && <p className="text-sm text-slate-500">Загружаем…</p>}
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <StatCard label="Пар (ниша × город)" value={data.total_pairs} />
            <StatCard label="Компаний всего" value={data.total_companies} />
            <StatCard label="Отзывов" value={data.total_reviews} />
            <StatCard label="Активных pain-тегов" value={data.total_pain_tags} />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Фильтр: ниша или город…"
              className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">
              Показано {filtered.length} из {data.items.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ниша</th>
                  <th className="px-3 py-2">Город</th>
                  <th className="px-3 py-2 text-right">Компаний</th>
                  <th className="px-3 py-2 text-right">Отзывов</th>
                  <th className="px-3 py-2 text-right">Разобрано AI</th>
                  <th className="px-3 py-2 text-right">Pain-тегов</th>
                  <th className="px-3 py-2 text-right">С pain-скорами</th>
                  <th className="px-3 py-2">Готовность</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => {
                  const analyzedPct = row.reviews_count > 0
                    ? Math.round((row.reviews_analyzed / row.reviews_count) * 100)
                    : 0;
                  const scoredPct = row.companies_count > 0
                    ? Math.round((row.companies_with_pain_scores / row.companies_count) * 100)
                    : 0;
                  const ready =
                    row.pain_tags_count > 0 &&
                    scoredPct >= 50;
                  return (
                    <tr key={`${row.niche}-${row.city}`} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{row.niche}</td>
                      <td className="px-3 py-2 text-slate-700">{row.city}</td>
                      <td className="px-3 py-2 text-right">{row.companies_count}</td>
                      <td className="px-3 py-2 text-right">{row.reviews_count}</td>
                      <td className="px-3 py-2 text-right">
                        {row.reviews_analyzed}
                        <span className="ml-1 text-xs text-slate-400">({analyzedPct}%)</span>
                      </td>
                      <td className="px-3 py-2 text-right">{row.pain_tags_count}</td>
                      <td className="px-3 py-2 text-right">
                        {row.companies_with_pain_scores}
                        <span className="ml-1 text-xs text-slate-400">({scoredPct}%)</span>
                      </td>
                      <td className="px-3 py-2">
                        {ready ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            готово
                          </span>
                        ) : row.reviews_analyzed === 0 ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            только парс
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            частично
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900">{value.toLocaleString('ru-RU')}</div>
    </div>
  );
}
