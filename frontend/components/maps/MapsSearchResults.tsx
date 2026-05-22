'use client';

/**
 * Экран результатов поиска по картам.
 *
 * - useSearchStream: SSE-стрим компаний и прогресса.
 * - listMapCompanies: финальная подгрузка с фильтрами после done (или сразу для
 *   статусов completed/from_cache).
 * - Фильтры / pain tags / drawer добавляются в шагах 15-16.
 */

import { useCallback, useEffect, useState } from 'react';

import { useSearchStream } from '@/components/maps/useSearchStream';
import {
  getMapSearch,
  listMapCompanies,
  type CompanyOut,
  type MapSearchOut,
} from '@/src/services/api/maps';

interface Props {
  search: MapSearchOut;
  initialMode: 'searching' | 'results';
  onNewSearch: () => void;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'from_cache']);

export function MapsSearchResults({ search: initialSearch, initialMode, onNewSearch }: Props) {
  const [search, setSearch] = useState<MapSearchOut>(initialSearch);
  const [companies, setCompanies] = useState<CompanyOut[]>([]);
  const [isLoading, setIsLoading] = useState(initialMode === 'results');

  const stream = useSearchStream(
    initialMode === 'searching' && !TERMINAL_STATUSES.has(initialSearch.status)
      ? initialSearch.id
      : null
  );

  const refreshCompanies = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listMapCompanies(search.id, {}, 100, 0);
      setCompanies(data.items);
    } finally {
      setIsLoading(false);
    }
  }, [search.id]);

  // Финальная загрузка с фильтрами:
  // - сразу для completed/from_cache
  // - после event=done из SSE
  // Также подтягиваем актуальный статус MapSearch (companies_found и пр.).
  useEffect(() => {
    if (TERMINAL_STATUSES.has(search.status)) {
      void refreshCompanies();
      return;
    }
    if (stream.done) {
      void (async () => {
        try {
          const updated = await getMapSearch(search.id);
          setSearch(updated);
        } catch {
          /* keep current */
        }
        await refreshCompanies();
      })();
    }
  }, [stream.done, search.id, search.status, refreshCompanies]);

  // Список для отображения: финальный (из API) приоритетнее live-стрима
  const liveCompanies = stream.companies;
  const hasFinal = companies.length > 0;
  const renderList = hasFinal ? companies : liveCompanies;
  const renderTotal = hasFinal ? companies.length : liveCompanies.length;

  return (
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
                : '') + '. '}
            Найдено компаний: {search.companies_found ?? renderTotal}.
          </p>
        </div>
        <button
          onClick={onNewSearch}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          Новый поиск
        </button>
      </div>

      {stream.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Ошибка стрима: {stream.error}
        </div>
      )}

      {isLoading && renderList.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          {TERMINAL_STATUSES.has(search.status)
            ? 'Загружаем компании…'
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
