'use client';

/**
 * Экран результатов поиска по картам.
 *
 * - useSearchStream: SSE-стрим компаний и прогресса.
 * - MapsFiltersPanel: фильтры + пресеты + облако тегов болей.
 * - listMapCompanies: перезапрашивается при изменении фильтров (debounce 300мс)
 *   после терминального статуса (completed/from_cache/done из SSE).
 *
 * MapsCompanyDetailDrawer и экспорт — шаг 16.
 */

import { useCallback, useEffect, useState } from 'react';

import { MapsFiltersPanel } from '@/components/maps/MapsFiltersPanel';
import { useSearchStream } from '@/components/maps/useSearchStream';
import {
  exportSearchCsvUrl,
  getMapSearch,
  listMapCompanies,
  type CompanyOut,
  type MapSearchFilter,
  type MapSearchOut,
} from '@/src/services/api/maps';

interface Props {
  search: MapSearchOut;
  initialMode: 'searching' | 'results';
  onNewSearch: () => void;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'from_cache']);
const DEFAULT_FILTER: MapSearchFilter = { sort_by: 'rating_desc' };

export function MapsSearchResults({ search: initialSearch, initialMode, onNewSearch }: Props) {
  const [search, setSearch] = useState<MapSearchOut>(initialSearch);
  const [companies, setCompanies] = useState<CompanyOut[]>([]);
  const [filter, setFilter] = useState<MapSearchFilter>(DEFAULT_FILTER);
  const [isLoading, setIsLoading] = useState(initialMode === 'results');

  const stream = useSearchStream(
    initialMode === 'searching' && !TERMINAL_STATUSES.has(initialSearch.status)
      ? initialSearch.id
      : null
  );

  const isTerminal = TERMINAL_STATUSES.has(search.status) || stream.done;

  // Когда стрим закончил — обновляем общий status (companies_found и пр.)
  useEffect(() => {
    if (!stream.done) return;
    void (async () => {
      try {
        setSearch(await getMapSearch(search.id));
      } catch {
        /* keep current */
      }
    })();
  }, [stream.done, search.id]);

  // Перезагрузка списка с фильтрами: только после terminal-статуса, с debounce 300мс
  const refreshCompanies = useCallback(
    async (f: MapSearchFilter) => {
      setIsLoading(true);
      try {
        const data = await listMapCompanies(search.id, f, 100, 0);
        setCompanies(data.items);
      } finally {
        setIsLoading(false);
      }
    },
    [search.id]
  );

  useEffect(() => {
    if (!isTerminal) return;
    const timer = setTimeout(() => {
      void refreshCompanies(filter);
    }, 300);
    return () => clearTimeout(timer);
  }, [filter, isTerminal, refreshCompanies]);

  // Список для отображения: финальный (из API) приоритетнее live-стрима
  const liveCompanies = stream.companies;
  const hasFinal = companies.length > 0;
  const renderList: any[] = hasFinal ? companies : liveCompanies;
  const renderTotal = hasFinal ? companies.length : liveCompanies.length;

  function handleExport() {
    const url = exportSearchCsvUrl(search.id, filter);
    // Простой способ для same-origin прокси: используем тег <a download>
    const a = document.createElement('a');
    a.href = url;
    a.download = `maps_search_${search.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <MapsFiltersPanel
        niche={search.niche}
        city={search.city}
        searchId={search.id}
        value={filter}
        onChange={setFilter}
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {search.niche} — {search.city}
            </h2>
            <p className="text-sm text-slate-500">
              Источники: {search.sources}. Статус: {search.status}.{' '}
              {stream.progress &&
                `Парсим: ${stream.progress.companies_processed ?? stream.progress.processed ?? 0}` +
                  (stream.progress.companies_total ?? stream.progress.total
                    ? ` / ${stream.progress.companies_total ?? stream.progress.total}`
                    : '') +
                  '. '}
              Найдено компаний: {search.companies_found ?? renderTotal}.
            </p>
          </div>
          <div className="flex gap-2">
            {isTerminal && companies.length > 0 && (
              <button
                onClick={handleExport}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Экспорт CSV
              </button>
            )}
            <button
              onClick={onNewSearch}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Новый поиск
            </button>
          </div>
        </div>

        {stream.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Ошибка стрима: {stream.error}
          </div>
        )}

        {isLoading && renderList.length === 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            {isTerminal
              ? 'Загружаем компании по выбранным фильтрам…'
              : 'Парсер ищет компании. Карточки появятся по мере готовности.'}
          </div>
        )}

        {renderList.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {renderList.map((c: any) => {
              const id = c.id ?? c.company_id;
              return (
                <li key={id} className="px-4 py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    {c.rating != null && (
                      <span className="app-badge app-badge-accent">
                        ★ {Number(c.rating).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {c.address || '—'} · отзывов {c.reviews_count ?? 0} · негатива{' '}
                    {c.reviews_negative_count ?? 0} · источник {c.source}
                  </div>
                  {Array.isArray(c.pain_tags) && c.pain_tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.pain_tags.slice(0, 4).map((t: any) => (
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
