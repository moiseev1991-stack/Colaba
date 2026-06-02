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

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { List, Map as MapIcon, Sparkles } from 'lucide-react';

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
import {
  getCompanyAnalyses,
  runPresetAnalysis,
  type CompanyAnalysisOut,
} from '@/src/services/api/reviews-ai';
import type { UserPresetOut } from '@/src/services/api/user-presets';

// Leaflet трогает window — выключаем SSR. ssr: false внутри 'use client'
// поддерживается в Next.js 14, см. https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading
const MapsCompaniesMap = dynamic(() => import('@/components/maps/MapsCompaniesMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
      Загружаю карту…
    </div>
  ),
});

interface Props {
  search: MapSearchOut;
  initialMode: 'searching' | 'results';
  /** Если на форме поиска юзер выбрал свой пресет с непустым ai_prompt —
   *  активируем AI-плашку сразу и автозапускаем анализ как только выдача
   *  загрузится. Без этого юзеру пришлось бы заново кликать тот же пресет
   *  в боковой панели результатов. */
  initialAiPreset?: UserPresetOut | null;
  onNewSearch: () => void;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'from_cache']);
const DEFAULT_FILTER: MapSearchFilter = { sort_by: 'rating_desc' };

function initialFilter(search: MapSearchOut): MapSearchFilter {
  // Если на форме поиска юзер выбрал пресет, его фильтры сохранились в
  // MapSearch.filters. Применяем их сразу — иначе юзер кликнул «Нужен сайт»
  // на форме, а после загрузки видит выдачу без фильтра.
  if (search.filters && Object.keys(search.filters).length > 0) {
    return { sort_by: 'rating_desc', ...search.filters };
  }
  return DEFAULT_FILTER;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'в очереди';
    case 'running': return 'парсим…';
    case 'completed': return 'готово';
    case 'failed': return 'ошибка';
    case 'from_cache': return 'из кэша';
    default: return status;
  }
}

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

export function MapsSearchResults({
  search: initialSearch,
  initialMode,
  initialAiPreset,
  onNewSearch,
}: Props) {
  const [search, setSearch] = useState<MapSearchOut>(initialSearch);
  const [companies, setCompanies] = useState<CompanyOut[]>([]);
  const [filter, setFilter] = useState<MapSearchFilter>(() => initialFilter(initialSearch));
  const [isLoading, setIsLoading] = useState(initialMode === 'results');
  const [drawerCompanyId, setDrawerCompanyId] = useState<number | null>(null);
  const [addToListCompanyId, setAddToListCompanyId] = useState<number | null>(null);
  // Bulk-выбор: множество выбранных company_id для массового добавления в
  // список лидов. AddToListModal уже умеет принимать массив; нам нужен только
  // toolbar и чекбоксы в карточках. Очищается при смене search.id.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftLoadingCompanyId, setDraftLoadingCompanyId] = useState<number | null>(null);
  const [draftData, setDraftData] = useState<OutreachDraftOut | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  // True после первого успешного listMapCompanies. Нужно, чтобы фильтр,
  // который вернул 0 компаний, не подменялся тихо на live-ленту (без
  // фильтра) — раньше юзер выбирал «Стабильный» и видел все 80 карточек
  // вместо «0 компаний под фильтр».
  const [companiesEverLoaded, setCompaniesEverLoaded] = useState(false);
  // AI-анализ под кастомный промпт пресета (фича из пресета.ai_prompt).
  // activeAiPreset выставляется когда юзер кликает user-preset с непустым
  // ai_prompt. После этого появляется CTA «Запустить AI-анализ» в шапке.
  // initialAiPreset !== null означает: пресет был выбран ещё на форме поиска —
  // активируем сразу и автозапускаем анализ как только выдача загрузится.
  const [activeAiPreset, setActiveAiPreset] = useState<UserPresetOut | null>(
    initialAiPreset ?? null,
  );
  const [aiAnalyses, setAiAnalyses] = useState<Map<number, CompanyAnalysisOut>>(new Map());
  const [aiTriggering, setAiTriggering] = useState(false);
  const [aiLastRun, setAiLastRun] = useState<{
    queued: number; cached: number; over_limit: number; limit_remaining: number;
  } | null>(null);
  const aiPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Защита от повторного автозапуска: эффект ниже триггерит handleTriggerAi
  // ровно один раз — иначе на каждом useEffect re-run он бы дёргал /run-preset-analysis.
  const autoTriggeredRef = useRef(false);
  // Режим отображения выдачи: список или карта. Карта — Leaflet + OSM,
  // загружается ленива через dynamic(), требует координат у компаний.
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  // Был ли filter тронут юзером в боковой панели после загрузки страницы.
  // Используется чтобы скрыть зелёный баннер «Применён пресет с формы поиска»
  // как только юзер начал крутить фильтры (иначе баннер «застрял» и врал).
  const [filterDirty, setFilterDirty] = useState(false);

  const handleFilterChange = useCallback((next: MapSearchFilter) => {
    setFilter(next);
    setFilterDirty(true);
  }, []);

  const onAddToList = useCallback((c: any) => {
    const id = c.id ?? c.company_id;
    if (id != null) setAddToListCompanyId(id);
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
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

  // Polling статуса + компаний каждые 3с, пока не terminal. SSE через
  // Next.js proxy буферизует (см. docs/maps-module-guide.md §7.3) —
  // без polling юзер не увидит смену pending→running→completed/failed
  // И не увидит карточки, которые celery успел сохранить.
  useEffect(() => {
    if (TERMINAL_STATUSES.has(search.status)) return;
    const timer = setInterval(async () => {
      try {
        const updated = await getMapSearch(search.id);
        if (updated.status !== search.status || updated.companies_found !== search.companies_found) {
          setSearch(updated);
        }
        // Пока парсер работает — параллельно дёргаем список компаний,
        // чтобы UI наполнялся карточками в реальном времени, а не ждал
        // terminal-статус. Без этого юзер видит пустоту и думает что
        // «ничего не происходит».
        const data = await listMapCompanies(search.id, DEFAULT_FILTER, 100, 0);
        if (data.items.length > companies.length) {
          setCompanies(data.items);
        }
      } catch {
        /* keep current */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [search.id, search.status, search.companies_found, companies.length]);

  // Перезагрузка списка с фильтрами: только после terminal-статуса, с debounce 300мс
  const refreshCompanies = useCallback(
    async (f: MapSearchFilter) => {
      setIsLoading(true);
      try {
        const data = await listMapCompanies(search.id, f, 100, 0);
        setCompanies(data.items);
        setCompaniesEverLoaded(true);
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

  // Список для отображения: после того, как companies хотя бы раз были
  // загружены через listMapCompanies, ВСЕГДА используем их (даже если 0).
  // Иначе фильтр, отдавший 0 компаний, тихо подменялся бы на нефильтрованную
  // live-ленту и юзер думал бы, что фильтр не работает.
  // Live-стрим используется только пока companies ещё ни разу не приходили
  // (первоначальная загрузка — пока парсер ещё не дошёл до terminal-статуса).
  const liveCompanies = stream.companies;
  const baseList: any[] = companiesEverLoaded ? companies : liveCompanies;
  const renderTotal = companiesEverLoaded ? companies.length : liveCompanies.length;

  // ----------- AI-анализ под кастомный промпт пресета -----------
  const visibleCompanyIds = baseList
    .map((c: any) => c.id ?? c.company_id)
    .filter((x: unknown): x is number => typeof x === 'number');

  const stopAiPolling = useCallback(() => {
    if (aiPollTimer.current) {
      clearInterval(aiPollTimer.current);
      aiPollTimer.current = null;
    }
  }, []);

  const fetchAnalyses = useCallback(async () => {
    if (activeAiPreset == null || visibleCompanyIds.length === 0) return;
    try {
      const items = await getCompanyAnalyses(activeAiPreset.id, visibleCompanyIds);
      setAiAnalyses((prev) => {
        const next = new Map(prev);
        for (const it of items) next.set(it.company_id, it);
        return next;
      });
      // Если ни одной pending — останавливаем поллинг
      const pendingCount = items.filter((x) => x.status === 'pending').length;
      if (pendingCount === 0) stopAiPolling();
    } catch {
      // silent
    }
  }, [activeAiPreset, visibleCompanyIds, stopAiPolling]);

  const onUserPresetWithAi = useCallback((preset: UserPresetOut) => {
    setActiveAiPreset(preset);
    setAiAnalyses(new Map());
    setAiLastRun(null);
    stopAiPolling();
  }, [stopAiPolling]);

  const handleTriggerAi = useCallback(async () => {
    if (!activeAiPreset || visibleCompanyIds.length === 0 || aiTriggering) return;
    setAiTriggering(true);
    try {
      const result = await runPresetAnalysis(activeAiPreset.id, visibleCompanyIds);
      setAiLastRun(result);
      // Сразу подтянем кэшированные результаты (cached>0)
      await fetchAnalyses();
      // Если ушли pending — начинаем поллинг каждые 3 сек
      if (result.queued > 0) {
        stopAiPolling();
        aiPollTimer.current = setInterval(() => { void fetchAnalyses(); }, 3000);
      }
    } catch (e) {
      // показать ошибку как-то — alert минимально
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Не удалось запустить AI-анализ';
      window.alert(typeof msg === 'string' ? msg : 'Не удалось запустить AI-анализ');
    } finally {
      setAiTriggering(false);
    }
  }, [activeAiPreset, visibleCompanyIds, aiTriggering, fetchAnalyses, stopAiPolling]);

  // Останавливаем поллинг при размонтировании
  useEffect(() => stopAiPolling, [stopAiPolling]);

  // Автозапуск анализа, если пресет выбрали ещё на форме поиска (initialAiPreset).
  // Условия: пресет активен, парсинг завершён, есть видимые компании, ещё не
  // запускали (ref-флаг + aiLastRun null), сейчас не триггерим.
  useEffect(() => {
    if (!activeAiPreset) return;
    if (autoTriggeredRef.current) return;
    if (!isTerminal) return;
    if (visibleCompanyIds.length === 0) return;
    if (aiTriggering || aiLastRun) return;
    autoTriggeredRef.current = true;
    void handleTriggerAi();
  }, [activeAiPreset, isTerminal, visibleCompanyIds.length, aiTriggering, aiLastRun, handleTriggerAi]);

  // Если юзер вручную выбрал другой AI-пресет (через MapsFiltersPanel) —
  // разрешаем автозапуск снова. onUserPresetWithAi сбрасывает aiLastRun,
  // используем это как сигнал.
  useEffect(() => {
    if (!aiLastRun) autoTriggeredRef.current = false;
  }, [aiLastRun]);

  const aiDoneCount = Array.from(aiAnalyses.values()).filter((x) => x.status === 'done').length;
  const aiPendingCount = Array.from(aiAnalyses.values()).filter((x) => x.status === 'pending').length;

  // UI-only сортировка по AI score: бэк про неё не знает (sort_by Literal-enum),
  // делаем на клиенте поверх baseList. Компании без AI-score (или с failed) —
  // в конец, независимо от направления, чтобы сверху всегда был содержательный
  // результат, а не пустые карточки.
  const renderList: any[] = (() => {
    if (filter.sort_by !== 'ai_score_desc' && filter.sort_by !== 'ai_score_asc') {
      return baseList;
    }
    const direction = filter.sort_by === 'ai_score_asc' ? 1 : -1;
    const withScore = baseList
      .map((c) => {
        const id = (c.id ?? c.company_id) as number | undefined;
        const a = typeof id === 'number' ? aiAnalyses.get(id) : undefined;
        const score = a?.status === 'done' ? (a.score ?? null) : null;
        return { c, score };
      });
    return withScore
      .slice()
      .sort((x, y) => {
        // null/без оценки → в конец
        if (x.score == null && y.score == null) return 0;
        if (x.score == null) return 1;
        if (y.score == null) return -1;
        return (x.score - y.score) * direction;
      })
      .map((it) => it.c);
  })();

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

  function handleExportWebsiteLeadsXlsx() {
    // Блок 4 ТЗ 2026-06-02: .xlsx с двумя вкладками для пакетной продажи
    // сайтов. Бэкенд: GET /maps/website-leads/export.
    const a = document.createElement('a');
    a.href = `/api/v1/maps/website-leads/export?search_id=${search.id}&only_website_leads=true`;
    a.download = `website-leads_${search.id}.xlsx`;
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
        onChange={handleFilterChange}
        onUserPresetWithAiSelected={onUserPresetWithAi}
        aiActive={activeAiPreset != null}
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {search.niche} —{' '}
              {search.mode === 'radius' && search.address
                ? `${search.address} · радиус ${((search.radius_meters ?? 0) / 1000).toFixed(1)} км`
                : search.city}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Источники: {search.sources}. Статус: {statusLabel(search.status)}.{' '}
              {isTerminal
                ? // Если фильтр сузил выдачу — показываем оба числа: «под фильтр / всего».
                  // Раньше счётчик «всего» оставался без изменений и врал юзеру.
                  companiesEverLoaded &&
                    typeof search.companies_found === 'number' &&
                    renderTotal !== search.companies_found
                  ? `Под фильтр: ${renderTotal} из ${search.companies_found}.`
                  : `Найдено компаний: ${search.companies_found ?? renderTotal}.`
                : `Найдено пока: ${renderTotal} компаний. Парсер ещё работает…`}
            </p>
            {search.filters && Object.keys(search.filters).length > 0 && !filterDirty && (
              <div className="mt-1 inline-block rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-0.5 text-[11px] text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300">
                Применён пресет с формы поиска — фильтры выставлены в панели слева
              </div>
            )}
            {activeAiPreset && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-violet-200 bg-violet-50/70 px-3 py-2 text-[12px] dark:border-violet-700/50 dark:bg-violet-900/30">
                <span className="inline-flex items-center gap-1 font-medium text-violet-900 dark:text-violet-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI-пресет «{activeAiPreset.name}»
                </span>
                <span className="text-violet-800/80 dark:text-violet-300">
                  {aiDoneCount > 0 || aiPendingCount > 0
                    ? `Готово ${aiDoneCount} · в работе ${aiPendingCount}`
                    : !isTerminal
                      ? 'AI-анализ запустится автоматически, как только парсер завершит сбор компаний'
                      : aiTriggering
                        ? 'Запускаю AI-анализ для всех видимых компаний…'
                        : 'AI-анализ запустится автоматически. Можешь нажать кнопку справа чтобы запустить вручную.'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleTriggerAi()}
                  disabled={aiTriggering || visibleCompanyIds.length === 0}
                  className="ml-auto rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {aiTriggering ? 'Запускаю…' : `Запустить AI-анализ (${visibleCompanyIds.length})`}
                </button>
                {aiLastRun && (
                  <div className="basis-full text-[11px] text-violet-700 dark:text-violet-300">
                    Поставлено: {aiLastRun.queued}, из кэша: {aiLastRun.cached}
                    {aiLastRun.over_limit > 0 && (
                      <span className="ml-1 text-rose-700 dark:text-rose-400">
                        · {aiLastRun.over_limit} не уехало (дневной лимит исчерпан)
                      </span>
                    )}
                    {' · '}остаток лимита на сутки: {aiLastRun.limit_remaining}
                  </div>
                )}
              </div>
            )}
            {!isTerminal && (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full w-1/3 animate-pulse bg-emerald-500" />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  карточки появляются по мере парсинга
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* View toggle: список vs карта. Прячем пока не подгружены
                компании — нечего показывать на карте. */}
            {renderTotal > 0 && (
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  className={
                    'inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium ' +
                    (viewMode === 'list'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700')
                  }
                >
                  <List className="h-3.5 w-3.5" /> Список
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('map')}
                  aria-pressed={viewMode === 'map'}
                  className={
                    'inline-flex items-center gap-1 border-l border-slate-300 px-2.5 py-1.5 text-[12px] font-medium dark:border-slate-600 ' +
                    (viewMode === 'map'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700')
                  }
                >
                  <MapIcon className="h-3.5 w-3.5" /> Карта
                </button>
              </div>
            )}
            {isTerminal && companies.length > 0 && (
              <>
                <button
                  onClick={handleExport}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Экспорт CSV
                </button>
                <button
                  onClick={handleExportWebsiteLeadsXlsx}
                  title="XLSX с двумя вкладками: «Лиды» (для продаж) + «Производство сайта» (для верстальщика). Только компании без собственного сайта."
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                >
                  💼 Excel: лиды на сайт
                </button>
              </>
            )}
            <button
              onClick={onNewSearch}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Новый поиск
            </button>
          </div>
        </div>

        {stream.error && !isSoftEmptyError(search.error) && search.status !== 'completed' && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            Ошибка стрима: {stream.error}
          </div>
        )}

        {search.status === 'failed' && isSoftEmptyError(search.error) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200">
            <div className="font-medium">Ничего не нашлось</div>
            <div className="mt-1 text-amber-700 dark:text-amber-300">
              По этому запросу 2GIS ничего не вернул. Попробуй переформулировать нишу
              или сменить город.
            </div>
          </div>
        )}

        {search.status === 'failed' && !isSoftEmptyError(search.error) && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-200">
            <div className="font-medium">Поиск завершился ошибкой</div>
            <div className="mt-1 text-red-700 dark:text-red-300">
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
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200">
              <div className="font-medium">Ничего не нашлось</div>
              <div className="mt-1 text-amber-700 dark:text-amber-300">{search.error}</div>
            </div>
          )}

        {isLoading && renderList.length === 0 && search.status !== 'failed' && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            {isTerminal
              ? 'Загружаем компании по выбранным фильтрам…'
              : 'Парсер ищет компании. Карточки появятся по мере готовности.'}
          </div>
        )}

        {!isLoading && companiesEverLoaded && renderList.length === 0 && search.status !== 'failed' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200">
            <div className="font-medium">Под выбранные фильтры — 0 компаний.</div>
            <div className="mt-1 text-amber-700 dark:text-amber-300">
              Ослабь критерии в панели слева (например, убери минимум рейтинга
              или отключи «Только с сайтом») или сбрось пресет.
            </div>
          </div>
        )}

        {renderList.length > 0 && viewMode === 'list' && (
          <>
            {/* Bulk-toolbar — появляется когда выбрана хотя бы одна компания.
                «Выбрать все на странице» работает всегда (отметить весь
                renderList разом, удобно для пакетной отгрузки). */}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const visibleIds = renderList
                    .map((c: any) => (c.id ?? c.company_id) as number | undefined)
                    .filter((x): x is number => typeof x === 'number');
                  const allSelected = visibleIds.every((id) => selectedIds.has(id));
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (allSelected) {
                      visibleIds.forEach((id) => next.delete(id));
                    } else {
                      visibleIds.forEach((id) => next.add(id));
                    }
                    return next;
                  });
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {(() => {
                  const visibleIds = renderList
                    .map((c: any) => (c.id ?? c.company_id) as number | undefined)
                    .filter((x): x is number => typeof x === 'number');
                  const allSelected =
                    visibleIds.length > 0 &&
                    visibleIds.every((id) => selectedIds.has(id));
                  return allSelected ? 'Снять выбор со всех' : 'Выбрать все на странице';
                })()}
              </button>
              {selectedIds.size > 0 && (
                <>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Выбрано: {selectedIds.size}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBulkAddOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  >
                    Добавить выбранные в список
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Очистить
                  </button>
                </>
              )}
            </div>
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
              {renderList.map((c: any) => {
                const id = c.id ?? c.company_id;
                const aiAnalysis = id != null ? aiAnalyses.get(id) ?? null : null;
                return (
                  <MapsCompanyCard
                    key={id}
                    company={c}
                    onClick={id != null ? () => setDrawerCompanyId(id) : undefined}
                    onAddToList={id != null ? onAddToList : undefined}
                    onDraftEmail={id != null ? onDraftEmail : undefined}
                    draftEmailLoading={draftLoadingCompanyId === id}
                    aiAnalysis={aiAnalysis}
                    selected={typeof id === 'number' && selectedIds.has(id)}
                    onToggleSelect={typeof id === 'number' ? toggleSelect : undefined}
                  />
                );
              })}
            </ul>
          </>
        )}

        {renderList.length > 0 && viewMode === 'map' && (
          <MapsCompaniesMap
            companies={renderList as CompanyOut[]}
            aiAnalyses={aiAnalyses}
            onOpenCompany={(id) => setDrawerCompanyId(id)}
          />
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

      {/* Bulk-добавление: тот же AddToListModal, но c массивом из чекбоксов. */}
      <AddToListModal
        open={bulkAddOpen}
        companyIds={Array.from(selectedIds)}
        defaultListName={`${search.niche} — ${search.city}`}
        onClose={() => setBulkAddOpen(false)}
        onDone={() => {
          // После добавления — закрываем модал и снимаем выбор, чтобы
          // юзер не отгрузил тех же лидов случайно второй раз.
          setBulkAddOpen(false);
          clearSelection();
        }}
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
