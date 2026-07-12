'use client';

/**
 * /app/pains — «Поиск компаний по боли».
 *
 * Юзер выбирает конкретный pain_key (например «Не могут дозвониться»),
 * опционально фильтрует по городу и нише — видит список карточек компаний
 * из ВСЕХ его прошлых поисков, у которых эта боль в топе. Клик по компании
 * ведёт в раздел «Лиды» (в дальнейшем — в drawer компании из глобального
 * контекста, пока это MVP).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  listCompaniesByPain,
  listMapCities,
  nicheSuggestions,
  PAIN_KEY_LABELS,
  type CompaniesByPainListOut,
  type PainKey,
} from '@/src/services/api/maps';

const PAIN_KEYS: PainKey[] = [
  'call_no_answer',
  'callback_lost',
  'schedule_hard',
  'schedule_wait',
  'queue_wait',
  'admin_rude',
  'unclear_pricing',
  'food_slow',
];

const PAGE_SIZE = 50;

export default function PainsPage() {
  const [painKey, setPainKey] = useState<PainKey>('call_no_answer');
  const [city, setCity] = useState<string>('');
  const [niche, setNiche] = useState<string>('');

  const [cities, setCities] = useState<string[]>([]);
  const [niches, setNiches] = useState<string[]>([]);

  const [data, setData] = useState<CompaniesByPainListOut | null>(null);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMapCities().then(setCities).catch(() => setCities([]));
    nicheSuggestions('').then(setNiches).catch(() => setNiches([]));
  }, []);

  const runSearch = useMemo(
    () => async (nextOffset: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listCompaniesByPain({
          pain_key: painKey,
          city: city || undefined,
          niche: niche || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setData(result);
        setOffset(nextOffset);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить компании');
        setData(null);
      } finally {
        setIsLoading(false);
      }
    },
    [painKey, city, niche],
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-6 pt-4 sm:pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Поиск компаний по боли</h1>
        <p className="text-sm text-slate-500">
          Выбери одну боль клиентов, при желании — город и нишу. Увидишь всех, у кого эта
          боль реально всплывает в отзывах.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Боль</span>
            <select
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={painKey}
              onChange={(e) => setPainKey(e.target.value as PainKey)}
            >
              {PAIN_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PAIN_KEY_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Город</span>
            <select
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">— любой —</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Ниша</span>
            <input
              list="pains-niche-list"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={niche}
              placeholder="салоны красоты, стома, ..."
              onChange={(e) => setNiche(e.target.value)}
            />
            <datalist id="pains-niche-list">
              {niches.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runSearch(0)}
            disabled={isLoading}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {isLoading ? 'Ищу…' : 'Показать'}
          </button>
          {data && !isLoading && (
            <span className="text-sm text-slate-500">
              Найдено {data.total} компаний
              {data.pain_labels.length > 0 && (
                <>
                  {' '}
                  · сматчилось {data.pain_labels.length} tag(ов):{' '}
                  <span className="text-slate-400" title={data.pain_labels.join(', ')}>
                    {data.pain_labels.slice(0, 3).join(', ')}
                    {data.pain_labels.length > 3 && ` +${data.pain_labels.length - 3}`}
                  </span>
                </>
              )}
            </span>
          )}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </section>

      {data && data.items.length === 0 && !isLoading && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 space-y-3">
          {(city || niche) ? (
            <>
              <p>
                В этой комбинации (
                {[niche && `ниша «${niche}»`, city && `город «${city}»`].filter(Boolean).join(', ')}
                ) компаний с болью «{PAIN_KEY_LABELS[painKey]}» не найдено — AI не выделил эту тему
                в отзывах.
              </p>
              <div className="flex flex-wrap gap-2">
                {city && (
                  <button
                    type="button"
                    onClick={() => {
                      setCity('');
                      void runSearch(0);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    × Убрать город «{city}»
                  </button>
                )}
                {niche && (
                  <button
                    type="button"
                    onClick={() => {
                      setNiche('');
                      void runSearch(0);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    × Убрать нишу «{niche}»
                  </button>
                )}
                {(city && niche) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCity('');
                      setNiche('');
                      void runSearch(0);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    × Убрать оба фильтра
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-center">
              Компаний с этой болью нет в БД. Возможно, пилот парсинга ещё не завершился —
              запусти поиск на странице «Лиды → По картам» или подожди пока разберётся текущая
              очередь.
            </p>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="grid gap-3">
          {data.items.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="text-base font-semibold text-slate-900 truncate">{c.name}</h3>
                    {c.niche && <span className="text-xs text-slate-500">{c.niche}</span>}
                    {c.city && (
                      <span className="text-xs text-slate-500">· {c.city}</span>
                    )}
                  </div>
                  {c.address && (
                    <div className="mt-0.5 text-xs text-slate-500 truncate">{c.address}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
                  {c.rating !== null && (
                    <span>
                      ★ {c.rating.toFixed(1)}{' '}
                      <span className="text-slate-400">/ {c.reviews_count} отз.</span>
                    </span>
                  )}
                  {c.lead_temperature !== null && (
                    <span
                      className={
                        c.lead_temperature >= 70
                          ? 'font-medium text-rose-600'
                          : c.lead_temperature >= 40
                          ? 'font-medium text-amber-600'
                          : 'text-slate-400'
                      }
                    >
                      🔥 {c.lead_temperature}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
                  {PAIN_KEY_LABELS[painKey]} · {c.pain_mention_count} упом.
                </span>
                {c.reviews_negative_count > 0 && (
                  <span className="text-slate-500">
                    Негатив: {c.reviews_negative_count}
                  </span>
                )}
                {c.phone && <span className="text-slate-500">{c.phone}</span>}
                {c.website && (
                  <a
                    href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-600 underline underline-offset-2"
                  >
                    {c.website}
                  </a>
                )}
              </div>

              {c.top_quote && (
                <blockquote className="mt-2 border-l-2 border-rose-300 bg-rose-50/40 px-3 py-1 text-xs italic text-slate-700">
                  «{c.top_quote}»
                </blockquote>
              )}

              <div className="mt-2 text-xs">
                <Link
                  href={`/app/leads?company=${c.id}`}
                  className="text-slate-600 underline underline-offset-2 hover:text-slate-900"
                >
                  Открыть в «Лидах» →
                </Link>
              </div>
            </article>
          ))}

          {(data.total > offset + data.items.length || offset > 0) && (
            <div className="flex items-center justify-center gap-3 pt-2 pb-6">
              <button
                type="button"
                disabled={offset === 0 || isLoading}
                onClick={() => void runSearch(Math.max(0, offset - PAGE_SIZE))}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
              >
                ← Назад
              </button>
              <span className="text-xs text-slate-500">
                {offset + 1}–{offset + data.items.length} из {data.total}
              </span>
              <button
                type="button"
                disabled={offset + data.items.length >= data.total || isLoading}
                onClick={() => void runSearch(offset + PAGE_SIZE)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
              >
                Дальше →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
