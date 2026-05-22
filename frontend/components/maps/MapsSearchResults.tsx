'use client';

/**
 * Заглушка экрана результатов / прогресса парсинга. Расширяется в шагах 14-16:
 *  - useSearchStream (SSE) для live-обновлений
 *  - MapsFiltersPanel + PainTagsCloud
 *  - MapsCompaniesList + MapsCompanyCard
 *  - MapsCompanyDetailDrawer
 *  - MapsExportButton
 */

import { useCallback, useEffect, useState } from 'react';

import { getMapSearch, listMapCompanies, type CompanyOut, type MapSearchOut } from '@/src/services/api/maps';

interface Props {
  search: MapSearchOut;
  initialMode: 'searching' | 'results';
  onNewSearch: () => void;
}

export function MapsSearchResults({ search: initialSearch, onNewSearch }: Props) {
  const [search, setSearch] = useState<MapSearchOut>(initialSearch);
  const [companies, setCompanies] = useState<CompanyOut[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCompanies = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listMapCompanies(search.id, {}, 100, 0);
      setCompanies(data.items);
      setTotal(data.total);
    } finally {
      setIsLoading(false);
    }
  }, [search.id]);

  // Polling статуса до 'completed/failed/from_cache' (плейсхолдер до SSE-хука в шаге 14)
  useEffect(() => {
    if (['completed', 'failed', 'from_cache'].includes(search.status)) {
      void refreshCompanies();
      return;
    }
    const timer = setInterval(async () => {
      try {
        const updated = await getMapSearch(search.id);
        setSearch(updated);
        if (['completed', 'failed', 'from_cache'].includes(updated.status)) {
          clearInterval(timer);
          await refreshCompanies();
        }
      } catch {
        /* swallow — повторим на следующем тике */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [search.id, search.status, refreshCompanies]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {search.niche} — {search.city}
          </h2>
          <p className="text-sm text-slate-500">
            Источники: {search.sources}. Статус: {search.status}. Найдено компаний:{' '}
            {search.companies_found ?? total}.
          </p>
        </div>
        <button
          onClick={onNewSearch}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          Новый поиск
        </button>
      </div>

      {isLoading && companies.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          {['pending', 'running'].includes(search.status)
            ? 'Парсер ищет компании. Результаты появятся здесь по мере готовности.'
            : 'Загружаем компании…'}
        </div>
      )}

      {companies.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {companies.map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-medium text-slate-900">{c.name}</div>
                {c.rating != null && (
                  <span className="app-badge app-badge-accent">★ {c.rating.toFixed(1)}</span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {c.address || '—'} · отзывов {c.reviews_count} · негатива{' '}
                {c.reviews_negative_count} · источник {c.source}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
