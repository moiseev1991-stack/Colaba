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

import { AddToListModal } from '@/components/maps/AddToListModal';
import { DraftEmailModal } from '@/components/maps/DraftEmailModal';
import { MapsCompanyCard } from '@/components/maps/MapsCompanyCard';
import { MapsCompanyDetailDrawer } from '@/components/maps/MapsCompanyDetailDrawer';
import { MapsFiltersPanel } from '@/components/maps/MapsFiltersPanel';
import { useSearchStream } from '@/components/maps/useSearchStream';
import {
  draftEmailForCompany,
  exportSearchCsvUrl,
  getMapSearch,
  listMapCompanies,
  type CompanyOut,
  type MapSearchFilter,
  type MapSearchOut,
  type OutreachDraftOut,
} from '@/src/services/api/maps';

interface Props {
  search: MapSearchOut;
  initialMode: 'searching' | 'results';
  onNewSearch: () => void;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'from_cache']);
const DEFAULT_FILTER: MapSearchFilter = { sort_by: 'rating_desc' };

// Шаблоны сообщений из backend, которые означают «2GIS просто ничего не нашёл»
// (не баг, не сетевой сбой) — показываем как мягкий EmptyResult, не как failed.
// Нужно для backwards-compat: ранее backend бросал RuntimeError с этими текстами,
// и в БД могут оставаться поиски с error_type='RuntimeError' и таким error.
function isSoftEmptyError(errorText: string | null | undefined): boolean {
  if (!errorText) return false;
  const e = errorText.toLowerCase();
  return (
    e.includes('results not found') ||
    e.includes('meta.code=404') ||
    e.includes('nothing found') ||
    e.includes('по этому запросу 2gis ничего не вернул')
  );
}

export function MapsSearchResults({ search: initialSearch, initialMode, onNewSearch }: Props) {
  const [search, setSearch] = useState<MapSearchOut>(initialSearch);
  const [companies, setCompanies] = useState<CompanyOut[]>([]);
  const [filter, setFilter] = useState<MapSearchFilter>(DEFAULT_FILTER);
  const [isLoading, setIsLoading] = useState(initialMode === 'results');
  const [drawerCompanyId, setDrawerCompanyId] = useState<number | null>(null);
  const [addToListCompanyId, setAddToListCompanyId] = useState<number | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftLoadingCompanyId, setDraftLoadingCompanyId] = useState<number | null>(null);
  const [draftData, setDraftData] = useState<OutreachDraftOut | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const onAddToList = useCallback((c: any) => {
    const id = c.id ?? c.company_id;
    if (id != null) setAddToListCompanyId(id);
  }, []);

  const onDraftEmail = useCallback(async (c: any) => {
    const id = c.id ?? c.company_id;
    if (id == null) return;
    setDraftOpen(true);
    setDraftLoading(true);
    setDraftLoadingCompanyId(id);
    setDraftData(null);
    setDraftError(null);
    try {
      const draft = await draftEmailForCompany(id);
      setDraftData(draft);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Не удалось сгенерировать письмо';
      setDraftError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setDraftLoading(false);
      setDraftLoadingCompanyId(null);
    }
  }, []);

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

  // Polling статуса каждые 3с, пока не terminal. SSE через Next.js proxy буферизует
  // (см. docs/maps-module-guide.md §7.3) — без polling юзер не увидит смену
  // pending→running→completed/failed до перезагрузки страницы.
  useEffect(() => {
    if (TERMINAL_STATUSES.has(search.status)) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getMapSearch(search.id);
        if (updated.status !== search.status || updated.companies_found !== search.companies_found) {
          setSearch(updated);
        }
      } catch {
        /* keep current */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [search.id, search.status, search.companies_found]);

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
                `Парсим: ${
                  stream.progress.companies_processed ??
                  stream.progress.processed ??
                  stream.progress.saved ??
                  0
                }` +
                  (stream.progress.companies_total ??
                  stream.progress.total ??
                  stream.progress.expected
                    ? ` / ${
                        stream.progress.companies_total ??
                        stream.progress.total ??
                        stream.progress.expected
                      }`
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

        {stream.error && !isSoftEmptyError(search.error) && search.status !== 'completed' && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Ошибка стрима: {stream.error}
          </div>
        )}

        {search.status === 'failed' && isSoftEmptyError(search.error) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="font-medium">Ничего не нашлось</div>
            <div className="mt-1 text-amber-700">
              По этому запросу 2GIS ничего не вернул. Попробуй переформулировать нишу
              или сменить город.
            </div>
          </div>
        )}

        {search.status === 'failed' && !isSoftEmptyError(search.error) && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <div className="font-medium">Поиск завершился ошибкой</div>
            <div className="mt-1 text-red-700">
              {search.error_type === 'ConnectTimeout' ? (
                <>
                  2GIS API не отвечает с этой машины (TLS-таймаут). Чаще всего это сеть провайдера
                  или SNI-фильтрация 2GIS — после деплоя на сервер с РФ-IP должно заработать.
                </>
              ) : search.error_type === 'MissingAPIKeyError' ? (
                <>
                  Не настроен <code>TWOGIS_API_KEY</code> в <code>.env</code>. Получи демо-ключ
                  на{' '}
                  <a href="https://dev.2gis.com" className="underline" target="_blank" rel="noopener noreferrer">
                    dev.2gis.com
                  </a>{' '}
                  и положи в env.
                </>
              ) : (
                <>
                  {search.error ||
                    `${search.error_type ?? 'Неизвестная ошибка'}. Подробности в логах celery-worker.`}
                </>
              )}
            </div>
          </div>
        )}

        {search.status === 'completed' &&
          search.error_type === 'EmptyResult' &&
          renderTotal === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="font-medium">Ничего не нашлось</div>
              <div className="mt-1 text-amber-700">{search.error}</div>
            </div>
          )}

        {isLoading && renderList.length === 0 && search.status !== 'failed' && (
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
                <MapsCompanyCard
                  key={id}
                  company={c}
                  onClick={id != null ? () => setDrawerCompanyId(id) : undefined}
                  onAddToList={id != null ? onAddToList : undefined}
                  onDraftEmail={id != null ? onDraftEmail : undefined}
                  draftEmailLoading={draftLoadingCompanyId === id}
                />
              );
            })}
          </ul>
        )}
      </div>

      <MapsCompanyDetailDrawer
        companyId={drawerCompanyId}
        onClose={() => setDrawerCompanyId(null)}
      />

      <AddToListModal
        open={addToListCompanyId != null}
        companyIds={addToListCompanyId != null ? [addToListCompanyId] : []}
        defaultListName={`${search.niche} — ${search.city}`}
        onClose={() => setAddToListCompanyId(null)}
      />

      <DraftEmailModal
        open={draftOpen}
        draft={draftData}
        loading={draftLoading}
        error={draftError}
        onClose={() => setDraftOpen(false)}
      />
    </div>
  );
}
