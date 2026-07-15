'use client';

/**
 * /app/admin/data-inventory — таблица «что вообще есть в БД».
 *
 * Для каждой пары (ниша, город): companies_count, reviews_count,
 * reviews_analyzed (с embedding), pain_tags_count, companies_with_pain_scores.
 * Сортировка по companies_count desc.
 *
 * Действия:
 * - Клик по нише/городу → фильтрует таблицу этим значением.
 * - «→ Открыть» → переход в /app/pains с pre-fill niche+city.
 * - «⚙ Дособрать» → POST /maps/admin/rebuild-pain-tags-for-niche для этой
 *   пары. Появляется если статус ≠ «готово».
 *
 * Только для суперюзера. Backend: GET /maps/admin/data-inventory.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface InventoryItem {
  niche: string;
  city: string;
  companies_count: number;
  reviews_count: number;
  reviews_analyzed: number;
  pain_tags_count: number;
  companies_with_pain_scores: number;
  // Опционально — старый backend не возвращает это поле.
  companies_with_marketing_dm?: number;
}

interface DmSourceStat {
  source: string;
  total: number;
  with_contact: number;
  marketing_dms: number;
  contact_rate: number; // 0..1
}

interface InventoryResponse {
  total_pairs: number;
  total_companies: number;
  total_reviews: number;
  total_pain_tags: number;
  // Опционально — старый backend без ЛПР-стата (до PR feat/dm-finder-quality)
  // возвращает undefined. UI должен корректно рендериться и на старом ответе.
  total_companies_with_marketing_dm?: number;
  dm_source_stats?: DmSourceStat[];
  items: InventoryItem[];
}

type RebuildState = 'idle' | 'busy' | 'done' | 'error';

// Матрица массового парсинга. Ниши × города — 5 × 10 = 50 запросов.
// Соответствует scripts/bulk_niche_parse.py DEFAULT_NICHES/CITIES.
const PARSE_NICHES = [
  'стоматология',
  'косметология',
  'лазерная эпиляция',
  'барбершоп',
  'ветеринарная клиника',
];
const PARSE_CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Балашиха',
  'Химки',
  'Красногорск',
  'Одинцово',
  'Екатеринбург',
  'Новосибирск',
  'Казань',
  'Краснодар',
];

export default function DataInventoryPage() {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  // Состояние rebuild-кнопок: ключ `${niche}::${city}`.
  const [rebuild, setRebuild] = useState<Record<string, { state: RebuildState; msg?: string }>>({});
  // Состояние массового парсинга
  const [parseBusy, setParseBusy] = useState(false);
  const [parseResults, setParseResults] = useState<Array<{
    niche: string;
    city: string;
    status: 'pending' | 'from_cache' | 'failed';
    id?: number;
  }>>([]);

  const reload = async () => {
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
  };

  useEffect(() => {
    void reload();
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

  const rebuildRow = async (niche: string, city: string) => {
    const key = `${niche}::${city}`;
    setRebuild((r) => ({ ...r, [key]: { state: 'busy' } }));
    try {
      const params = new URLSearchParams({ niche, city, sentiment: 'negative' });
      const res = await fetch(
        `/api/v1/maps/admin/rebuild-pain-tags-for-niche?${params.toString()}`,
        { method: 'POST' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRebuild((r) => ({
          ...r,
          [key]: { state: 'error', msg: `HTTP ${res.status}: ${body?.detail ?? ''}` },
        }));
        return;
      }
      const msg = body.queued
        ? `${body.companies_queued_for_analyze} компаний → analyze, потом recluster (~5-8 мин)`
        : (body.hint ?? 'Нет компаний с этой нишей.');
      setRebuild((r) => ({ ...r, [key]: { state: 'done', msg } }));
    } catch (e) {
      setRebuild((r) => ({
        ...r,
        [key]: { state: 'error', msg: e instanceof Error ? e.message : 'network' },
      }));
    }
  };

  // Массовый парсинг матрицы (ниши × города). Последовательные POST /maps/search
  // с задержкой 7с (rate-limit 10/min). Yandex_maps only — 2GIS-ключ заблокирован.
  const runMassParse = async () => {
    if (parseBusy) return;
    if (!confirm(
      `Запустить парсинг матрицы: ${PARSE_NICHES.length} ниш × ${PARSE_CITIES.length} городов = ${PARSE_NICHES.length * PARSE_CITIES.length} запросов. Yandex.Карты, ~10 минут в очереди celery.\n\nПродолжить?`,
    )) return;
    setParseBusy(true);
    setParseResults([]);
    const pairs: Array<[string, string]> = [];
    for (const city of PARSE_CITIES) {
      for (const niche of PARSE_NICHES) {
        pairs.push([niche, city]);
      }
    }
    for (let i = 0; i < pairs.length; i++) {
      const [niche, city] = pairs[i];
      try {
        const res = await fetch('/api/v1/maps/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            niche, city,
            sources: ['yandex_maps'],
            mode: 'city',
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 201 && body.id) {
          setParseResults((prev) => [...prev, {
            niche, city,
            status: body.status === 'from_cache' ? 'from_cache' : 'pending',
            id: body.id,
          }]);
        } else {
          setParseResults((prev) => [...prev, { niche, city, status: 'failed' }]);
        }
      } catch {
        setParseResults((prev) => [...prev, { niche, city, status: 'failed' }]);
      }
      // Rate-limit 10/min = 6с/запрос. Ставим 7с с запасом.
      if (i < pairs.length - 1) {
        await new Promise((r) => setTimeout(r, 7000));
      }
    }
    setParseBusy(false);
    // Обновляем таблицу
    void reload();
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-6 pt-4 sm:pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Data inventory (admin)</h1>
        <p className="text-sm text-slate-500">
          Что реально есть в БД: сколько компаний, отзывов и AI-тегов по каждой (ниша, город).
          Клик по нише/городу — фильтр. «Дособрать» — доразметить AI-теги. «→ Открыть» — переход в поиск по болям.
        </p>
      </header>

      {/* Массовый парсинг — расширить БД новыми (ниша, город) парами */}
      <section className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="font-medium text-slate-800">
              🚀 Массовый парсинг: {PARSE_NICHES.length} ниш × {PARSE_CITIES.length} городов
              {' '}= {PARSE_NICHES.length * PARSE_CITIES.length} запросов
            </span>
            <span className="text-xs text-slate-500">
              Ниши: {PARSE_NICHES.join(', ')} · Города: {PARSE_CITIES.slice(0, 4).join(', ')} + ещё {PARSE_CITIES.length - 4} · Источник: Yandex.Карты
            </span>
          </div>
          <button
            type="button"
            onClick={() => void runMassParse()}
            disabled={parseBusy}
            className="rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {parseBusy
              ? `Парсим… ${parseResults.length} / ${PARSE_NICHES.length * PARSE_CITIES.length}`
              : '🚀 Запустить парсинг'}
          </button>
        </div>
        {parseResults.length > 0 && (
          <div className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs space-y-0.5 max-h-40 overflow-auto">
            <div className="font-medium text-slate-600 mb-1">
              Результаты: {parseResults.filter((r) => r.status === 'pending').length} pending,
              {' '}{parseResults.filter((r) => r.status === 'from_cache').length} из кеша,
              {' '}{parseResults.filter((r) => r.status === 'failed').length} ошибок
            </div>
            {parseResults.slice(-8).map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={
                  r.status === 'pending' ? 'text-emerald-700' :
                  r.status === 'from_cache' ? 'text-slate-600' : 'text-rose-700'
                }>
                  {r.status === 'pending' && '✓'}
                  {r.status === 'from_cache' && '⚡'}
                  {r.status === 'failed' && '✗'}
                </span>
                <span className="text-slate-700">{r.city} / {r.niche}</span>
                <span className="ml-auto text-slate-400">
                  {r.status}{r.id ? ` #${r.id}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {loading && <p className="text-sm text-slate-500">Загружаем…</p>}
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
            <StatCard label="Пар (ниша × город)" value={data.total_pairs} />
            <StatCard label="Компаний всего" value={data.total_companies} />
            <StatCard label="Отзывов" value={data.total_reviews} />
            <StatCard label="Активных pain-тегов" value={data.total_pain_tags} />
            <StatCard
              label="С маркетинг-ЛПР"
              value={data.total_companies_with_marketing_dm ?? 0}
              hint={
                data.total_companies > 0
                  ? `${Math.round(
                      ((data.total_companies_with_marketing_dm ?? 0) /
                        data.total_companies) *
                        100,
                    )}% всех компаний`
                  : undefined
              }
            />
          </div>

          {/* Источники ЛПР — success-rate по source. Даёт видимость
              «hh 403-ит», «vk без токена», «prodoctorov лучше egrul» и т.д. */}
          {(data.dm_source_stats?.length ?? 0) > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">
                  🎯 Источники ЛПР — success-rate
                </h2>
                <span className="text-xs text-slate-500">
                  contact_rate = % персон с рабочим email/phone/vk
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Источник</th>
                      <th className="px-3 py-2 text-right">Персон</th>
                      <th className="px-3 py-2 text-right">С контактом</th>
                      <th className="px-3 py-2 text-right">%</th>
                      <th className="px-3 py-2 text-right">Marketing-DM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.dm_source_stats ?? []).map((s) => {
                      const rate = Math.round(s.contact_rate * 100);
                      const rateBad = rate < 30;
                      const rateGood = rate >= 60;
                      return (
                        <tr key={s.source} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-700">
                            {s.source}
                          </td>
                          <td className="px-3 py-1.5 text-right">{s.total}</td>
                          <td className="px-3 py-1.5 text-right">
                            {s.with_contact}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <span
                              className={
                                'inline-block rounded px-1.5 py-0.5 text-xs font-medium ' +
                                (rateGood
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : rateBad
                                    ? 'bg-rose-50 text-rose-800'
                                    : 'bg-amber-50 text-amber-800')
                              }
                            >
                              {rate}%
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {s.marketing_dms}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="flex items-center gap-2 flex-wrap">
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
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                × Сбросить фильтр
              </button>
            )}
            <button
              type="button"
              onClick={() => void reload()}
              className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              ↻ Обновить
            </button>
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
                  <th className="px-3 py-2 text-right">С ЛПР</th>
                  <th className="px-3 py-2">Готовность</th>
                  <th className="px-3 py-2 text-right">Действия</th>
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
                  const status: 'ready' | 'partial' | 'raw' =
                    ready ? 'ready'
                    : row.reviews_analyzed === 0 ? 'raw'
                    : 'partial';
                  const key = `${row.niche}::${row.city}`;
                  const rb = rebuild[key];
                  const painsHref = `/app/pains?niche=${encodeURIComponent(row.niche)}&city=${encodeURIComponent(row.city)}`;
                  return (
                    <tr key={key} className="hover:bg-slate-50 align-top">
                      <td className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          onClick={() => setQ(row.niche)}
                          className="text-left text-slate-900 hover:text-rose-700 hover:underline underline-offset-2"
                          title="Отфильтровать этой нишей"
                        >
                          {row.niche}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setQ(row.city)}
                          className="text-slate-700 hover:text-rose-700 hover:underline underline-offset-2"
                          title="Отфильтровать этим городом"
                        >
                          {row.city}
                        </button>
                      </td>
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
                      <td className="px-3 py-2 text-right">
                        {(() => {
                          const mdm = row.companies_with_marketing_dm ?? 0;
                          const mdmPct = row.companies_count > 0
                            ? Math.round((mdm / row.companies_count) * 100)
                            : 0;
                          const cls = mdmPct >= 50 ? 'text-emerald-700' : mdmPct >= 20 ? 'text-amber-700' : 'text-rose-700';
                          return (
                            <>
                              <span className={cls}>{mdm}</span>
                              <span className="ml-1 text-xs text-slate-400">({mdmPct}%)</span>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        {status === 'ready' && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            готово
                          </span>
                        )}
                        {status === 'raw' && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            только парс
                          </span>
                        )}
                        {status === 'partial' && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            частично
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right space-y-1">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link
                            href={painsHref}
                            className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
                            title="Открыть в поиске по болям"
                          >
                            → Открыть
                          </Link>
                          {status !== 'ready' && (
                            <button
                              type="button"
                              onClick={() => void rebuildRow(row.niche, row.city)}
                              disabled={rb?.state === 'busy' || rb?.state === 'done'}
                              className={
                                'rounded-md border px-2 py-0.5 text-xs font-medium disabled:opacity-50 ' +
                                (rb?.state === 'done'
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : rb?.state === 'error'
                                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100')
                              }
                              title="Пересобрать AI-разметку и pain_tags"
                            >
                              {rb?.state === 'busy' && 'Ставлю…'}
                              {rb?.state === 'done' && '✓ В очереди'}
                              {rb?.state === 'error' && '✗ Ошибка'}
                              {(!rb || rb.state === 'idle') && '⚙ Дособрать'}
                            </button>
                          )}
                        </div>
                        {rb?.msg && (
                          <p className="text-[10.5px] leading-tight text-slate-500 max-w-[220px] ml-auto">
                            {rb.msg}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Кнопка бэтч-пересборки всех «частично/только парс» */}
          {filtered.some((r) => {
            const scoredPct = r.companies_count > 0
              ? Math.round((r.companies_with_pain_scores / r.companies_count) * 100)
              : 0;
            return !(r.pain_tags_count > 0 && scoredPct >= 50);
          }) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
              <span>
                Можно поставить в очередь пересборку для всех «частично / только парс» пар в текущем фильтре.
              </span>
              <button
                type="button"
                onClick={async () => {
                  for (const r of filtered) {
                    const scoredPct = r.companies_count > 0
                      ? Math.round((r.companies_with_pain_scores / r.companies_count) * 100)
                      : 0;
                    const ready = r.pain_tags_count > 0 && scoredPct >= 50;
                    if (ready) continue;
                    if (r.companies_count === 0) continue;
                    // Пауза 500мс между запросами — не завалим rate-limit
                    // (3/min на этот endpoint, но с гэпом рискуем на батче 20+)
                    await rebuildRow(r.niche, r.city);
                    await new Promise((res) => setTimeout(res, 500));
                  }
                }}
                className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                ⚙ Дособрать все ({filtered.filter((r) => {
                  const scoredPct = r.companies_count > 0
                    ? Math.round((r.companies_with_pain_scores / r.companies_count) * 100)
                    : 0;
                  return !(r.pain_tags_count > 0 && scoredPct >= 50) && r.companies_count > 0;
                }).length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900">
        {value.toLocaleString('ru-RU')}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}
