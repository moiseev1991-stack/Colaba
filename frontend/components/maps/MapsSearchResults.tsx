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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HelpCircle, List, Map as MapIcon, Sliders, Sparkles } from 'lucide-react';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { AddToListModal } from '@/components/maps/AddToListModal';
import { DraftEmailModal } from '@/components/maps/DraftEmailModal';
import { MapsCompanyCard } from '@/components/maps/MapsCompanyCard';
import { MapsCompanyDetailDrawer } from '@/components/maps/MapsCompanyDetailDrawer';
import { MapsFiltersPanel } from '@/components/maps/MapsFiltersPanel';
import { useSearchStream } from '@/components/maps/useSearchStream';
import {
  adminReclusterNiche,
  draftEmailForCompany,
  enrichCompaniesTeam,
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

const SOURCE_FILTER_VALUES = new Set(['all', '2gis', 'yandex_maps']);
function parseSourceFilter(raw: string | null): MapSearchFilter['source_filter'] | undefined {
  if (!raw) return undefined;
  return SOURCE_FILTER_VALUES.has(raw) ? (raw as 'all' | '2gis' | 'yandex_maps') : undefined;
}

function initialFilter(
  search: MapSearchOut,
  urlSource: MapSearchFilter['source_filter'] | undefined,
): MapSearchFilter {
  // Если на форме поиска юзер выбрал пресет, его фильтры сохранились в
  // MapSearch.filters. Применяем их сразу — иначе юзер кликнул «Нужен сайт»
  // на форме, а после загрузки видит выдачу без фильтра.
  const base: MapSearchFilter =
    search.filters && Object.keys(search.filters).length > 0
      ? { sort_by: 'rating_desc', ...search.filters }
      : { ...DEFAULT_FILTER };
  // URL-параметр ?src=2gis|yandex_maps|all имеет приоритет над пресетом —
  // юзер пришёл по ссылке/назад с явным выбором источника.
  if (urlSource !== undefined) base.source_filter = urlSource;
  return base;
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState<MapSearchOut>(initialSearch);
  const [companies, setCompanies] = useState<CompanyOut[]>([]);
  // Multi-source (ТЗ 2026-06-04): счётчики по источникам для сегмент-переключателя
  // «Все · 2GIS · Я.Карты». Берутся из CompaniesListOut.source_counts.
  const [sourceCounts, setSourceCounts] = useState<{
    total: number; twogis: number; yandex_maps: number; both: number;
  } | null>(null);
  const [filter, setFilter] = useState<MapSearchFilter>(() =>
    initialFilter(initialSearch, parseSourceFilter(searchParams?.get('src') ?? null)),
  );
  const [isLoading, setIsLoading] = useState(initialMode === 'results');
  const [drawerCompanyId, setDrawerCompanyId] = useState<number | null>(null);
  const [addToListCompanyId, setAddToListCompanyId] = useState<number | null>(null);
  // Bulk-выбор: множество выбранных company_id для массового добавления в
  // список лидов. AddToListModal уже умеет принимать массив; нам нужен только
  // toolbar и чекбоксы в карточках. Очищается при смене search.id.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  // ЛПР bulk-enrich UI-state: одно из 'idle' | 'loading' | сообщение результата.
  const [lprBulkBusy, setLprBulkBusy] = useState(false);
  const [lprBulkMsg, setLprBulkMsg] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
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
  // Сворачиваемая легенда бейджей карточки (🔥/💼/Nл). Юзер регулярно
  // путался что они значат — теперь рядом с шапкой есть «?»-кнопка.
  const [showBadgeLegend, setShowBadgeLegend] = useState(false);
  // Recluster (AI-разбор болей ниши). Cron делает это раз в сутки только
  // для top-30 ниш; для редких комбинаций типа «стоматология/Балашиха»
  // company_pain_scores оставался пуст → карточки в fallback. Кнопка
  // даёт юзеру вручную поставить recluster в очередь.
  const [reclusterState, setReclusterState] = useState<
    'idle' | 'queueing' | 'queued' | 'error'
  >('idle');
  const [reclusterMsg, setReclusterMsg] = useState<string>('');
  // §4.1 ТЗ редизайна — на мобайле фильтр-панель открывается через
  // BottomSheet по кнопке, а не стэкается над списком (было: уезжала
  // и съедала экран ещё до того как юзер увидел компании).
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Был ли filter тронут юзером в боковой панели после загрузки страницы.
  // Используется чтобы скрыть зелёный баннер «Применён пресет с формы поиска»
  // как только юзер начал крутить фильтры (иначе баннер «застрял» и врал).
  const [filterDirty, setFilterDirty] = useState(false);

  const handleFilterChange = useCallback((next: MapSearchFilter) => {
    setFilter(next);
    setFilterDirty(true);
  }, []);

  // Multi-source persistence (§3.1 ТЗ 2026-06-04): синхронизируем
  // filter.source_filter с query-параметром ?src=. router.replace без scroll
  // не вызывает full reload — Next App Router просто меняет URL. Это даёт
  // «возврат по назад/вперёд», переход по ссылке и устойчивость к F5
  // (в рамках сессии где search уже создан в родительском MapsSearchPanel).
  const lastUrlSrcRef = useRef<string | null>(searchParams?.get('src') ?? null);
  useEffect(() => {
    const current = filter.source_filter && filter.source_filter !== 'all'
      ? filter.source_filter
      : null;
    if (lastUrlSrcRef.current === current) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (current) params.set('src', current);
    else params.delete('src');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    lastUrlSrcRef.current = current;
  }, [filter.source_filter, pathname, router, searchParams]);

  // Внешние изменения URL (Назад/Вперёд браузера, переход по ссылке) →
  // подхватываем ?src= в state, если оно расходится с текущим.
  useEffect(() => {
    const fromUrl = parseSourceFilter(searchParams?.get('src') ?? null) ?? 'all';
    const inState = filter.source_filter ?? 'all';
    if (fromUrl !== inState) {
      lastUrlSrcRef.current = fromUrl === 'all' ? null : fromUrl;
      setFilter((prev) => ({ ...prev, source_filter: fromUrl }));
      setFilterDirty(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
        if (data.source_counts) setSourceCounts(data.source_counts);
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
        if (data.source_counts) setSourceCounts(data.source_counts);
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
    // Backend ограничивает один POST не более чем AI_RUN_MAX компаниями. Если
    // в выдаче больше — раньше прилетал 422 «Не удалось запустить AI-анализ»
    // без объяснений. Теперь — режем сами и предупреждаем юзера, чтобы он
    // понял, почему обработались не все.
    const AI_RUN_MAX = 500;
    let ids = visibleCompanyIds;
    if (ids.length > AI_RUN_MAX) {
      window.alert(
        `Видимых компаний ${ids.length}, AI-анализ за один запуск обрабатывает максимум ${AI_RUN_MAX}. ` +
          `Запускаю на первых ${AI_RUN_MAX}. Сузь фильтры и нажми ещё раз для остальных.`
      );
      ids = ids.slice(0, AI_RUN_MAX);
    }
    setAiTriggering(true);
    try {
      const result = await runPresetAnalysis(activeAiPreset.id, ids);
      setAiLastRun(result);
      // Сразу подтянем кэшированные результаты (cached>0)
      await fetchAnalyses();
      // Если ушли pending — начинаем поллинг каждые 3 сек
      if (result.queued > 0) {
        stopAiPolling();
        aiPollTimer.current = setInterval(() => { void fetchAnalyses(); }, 3000);
      }
    } catch (e) {
      // Показываем человечий detail если бэк его прислал (наш handler
      // отдаёт pydantic errors() при 422). Иначе — общий fallback.
      const err = e as { response?: { status?: number; data?: { detail?: unknown } } };
      const detail = err?.response?.data?.detail;
      let msg = 'Не удалось запустить AI-анализ';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        msg = `Ошибка проверки запроса: ${JSON.stringify(detail[0])}`;
      }
      window.alert(msg);
    } finally {
      setAiTriggering(false);
    }
  }, [activeAiPreset, visibleCompanyIds, aiTriggering, fetchAnalyses, stopAiPolling]);

  // Останавливаем поллинг при размонтировании
  useEffect(() => stopAiPolling, [stopAiPolling]);

  const handleReclusterNiche = useCallback(async () => {
    if (reclusterState === 'queueing' || reclusterState === 'queued') return;
    setReclusterState('queueing');
    setReclusterMsg('');
    try {
      const result = await adminReclusterNiche(search.id);
      setReclusterState('queued');
      setReclusterMsg(result.hint);
      // Цепочка: analyze_reviews (sentiment+embeddings) ~1-2 мин + countdown 120с
      // + recluster_pains_for_niche (LLM-naming N кластеров) ~1-2 мин = ~4 мин.
      // Берём 4 минуты + запас.
      window.setTimeout(() => {
        void refreshCompanies(filter);
      }, 240_000);
    } catch (e) {
      setReclusterState('error');
      const err = e as { response?: { status?: number; data?: { detail?: unknown } } };
      const detail = err?.response?.data?.detail;
      setReclusterMsg(
        typeof detail === 'string'
          ? detail
          : 'Не удалось поставить AI-разбор в очередь. Проверь логи.',
      );
    }
  }, [reclusterState, search.id, refreshCompanies, filter]);

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

  function handleExportSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const url = exportSearchCsvUrl(search.id, filter, ids);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maps_search_${search.id}_selected.csv`;
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
      {/* Десктоп: фильтр-панель слева. Мобайл — открывается из BottomSheet ниже. */}
      <div className="hidden lg:block">
        <MapsFiltersPanel
          niche={search.niche}
          city={search.city}
          searchId={search.id}
          value={filter}
          onChange={handleFilterChange}
          onUserPresetWithAiSelected={onUserPresetWithAi}
          aiActive={activeAiPreset != null}
        />
      </div>

      {/* Мобайл: BottomSheet с той же панелью внутри. */}
      <BottomSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        title="Фильтры и пресеты"
        maxHeight="92vh"
      >
        <MapsFiltersPanel
          niche={search.niche}
          city={search.city}
          searchId={search.id}
          value={filter}
          onChange={(next) => {
            handleFilterChange(next);
          }}
          onUserPresetWithAiSelected={(p) => {
            onUserPresetWithAi(p);
            setMobileFiltersOpen(false);
          }}
          aiActive={activeAiPreset != null}
        />
        <div className="sticky bottom-0 mt-3 -mx-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3">
          <ButtonV2
            variant="primary"
            size="lg"
            onClick={() => setMobileFiltersOpen(false)}
            className="w-full"
          >
            Применить
          </ButtonV2>
        </div>
      </BottomSheet>

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
              <button
                type="button"
                onClick={() => setShowBadgeLegend((s) => !s)}
                className="ml-2 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                aria-expanded={showBadgeLegend}
                title="Что значат бейджи 🔥 / 💼 / Nл в карточке?"
              >
                <HelpCircle className="h-3 w-3" /> что значат бейджи?
              </button>
            </p>
            {showBadgeLegend && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
                <div className="mb-1.5 font-medium">Бейджи на карточке справа сверху:</div>
                <ul className="space-y-1">
                  <li>
                    <span className="mr-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">🔥 70+</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      <b>Температура лида</b> 0–100. Связка рейтинг × кол-во отзывов × свежесть × контакты × ответы владельца. <b>70+</b> — горячий лид (звонить сразу), 40–69 — тёплый, &lt;40 — холодный.
                    </span>
                  </li>
                  <li>
                    <span className="mr-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">💼 70+</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      <b>Website-score</b> — «нужен сайт, а его нет». Чем выше, тем больше шансов продать сайт. Если бейджа <b>нет совсем</b> — у компании уже есть свой работающий сайт.
                    </span>
                  </li>
                  <li>
                    <span className="mr-1 rounded-v2-sm bg-[var(--signal-cool-bg)] px-1.5 py-0.5 text-[11px] text-[color:var(--signal-cool)] ring-1 ring-inset ring-[color:var(--signal-cool)]/30">5л · ₽ 1.2М</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      <b>Юр.данные (DaData)</b>: возраст компании в годах и оборот за последний год (если DaData отдала). Клик по карточке → блок «Юр.данные».
                    </span>
                  </li>
                  <li>
                    <span className="mr-1 rounded-v2-sm bg-[var(--signal-warm-bg)] px-1.5 py-0.5 text-[11px] text-[color:var(--signal-warm)] ring-1 ring-inset ring-[color:var(--signal-warm)]/30">пилюли</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      Жёлтый блок = боль клиентов (AI разобрал отзывы), розовый блок = кусок негативного отзыва (AI ещё не классифицировал боль).
                    </span>
                  </li>
                </ul>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Цвет шкалы 🔥/💼: <span className="text-slate-500">серый</span> (&lt;40) → <span className="text-amber-700">жёлтый</span> (40–69) → <span className="text-rose-700 font-semibold">красный</span> (70+).
                </div>
              </div>
            )}
            {search.filters && Object.keys(search.filters).length > 0 && !filterDirty && (
              <div className="mt-1 inline-block rounded-v2-sm border border-[color:var(--signal-good)]/30 bg-[var(--signal-good-bg)] px-2 py-0.5 text-[11px] text-[color:var(--signal-good)]">
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
                  <div className="h-full w-1/3 animate-pulse bg-brand-gradient" />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  карточки появляются по мере парсинга
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* §4.1 редизайн: мобильная кнопка «Фильтры» открывает BottomSheet.
                На lg+ панель уже видна слева, поэтому кнопка скрыта. */}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden inline-flex min-h-[44px] items-center gap-1.5 rounded-v2-sm border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-1.5 text-[13px] font-medium text-[hsl(var(--text))] hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400"
            >
              <Sliders className="h-4 w-4" />
              Фильтры
            </button>
            {/* Multi-source сегмент-переключатель «Все · 2GIS · Я.Карты»
                (ТЗ 2026-06-04). Прячем когда оба источника пустые (ни одной
                yandex_maps компании в выдаче — переключатель не нужен).
                Счётчики берём из source_counts (полная выборка поиска). */}
            {renderTotal > 0 && sourceCounts && sourceCounts.yandex_maps > 0 && sourceCounts.twogis > 0 && (
              <div
                className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600"
                title={`Найдено: всего ${sourceCounts.total} · 2GIS ${sourceCounts.twogis} · Я.Карты ${sourceCounts.yandex_maps} · в обоих ${sourceCounts.both}`}
              >
                {([
                  { id: 'all', label: 'Все', count: sourceCounts.total },
                  { id: '2gis', label: '2GIS', count: sourceCounts.twogis },
                  { id: 'yandex_maps', label: 'Я.Карты', count: sourceCounts.yandex_maps },
                ] as const).map((opt, idx) => {
                  const active = (filter.source_filter ?? 'all') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleFilterChange({ ...filter, source_filter: opt.id })}
                      aria-pressed={active}
                      className={
                        'inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium ' +
                        (idx > 0 ? 'border-l border-slate-300 dark:border-slate-600 ' : '') +
                        (active
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700')
                      }
                    >
                      {opt.label}
                      <span className={active ? 'opacity-80' : 'opacity-60'}>{opt.count}</span>
                    </button>
                  );
                })}
              </div>
            )}

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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportMenuOpen((v) => !v)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  aria-haspopup="menu"
                  aria-expanded={exportMenuOpen}
                >
                  📥 Экспорт ▾
                </button>
                {exportMenuOpen && (
                  <>
                    {/* Невидимый overlay для закрытия по клику вне меню. */}
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setExportMenuOpen(false)}
                      aria-hidden
                    />
                    <div
                      role="menu"
                      className="absolute right-0 z-40 mt-1 w-72 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false);
                          handleExport();
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-200"
                      >
                        <div className="font-medium">CSV — все компании</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          с учётом текущих фильтров слева
                        </div>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={selectedIds.size === 0}
                        onClick={() => {
                          setExportMenuOpen(false);
                          handleExportSelected();
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700 dark:text-slate-200"
                      >
                        <div className="font-medium">
                          CSV — выбранные{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedIds.size === 0
                            ? 'отметь карточки чекбоксами слева'
                            : 'только отмеченные карточки'}
                        </div>
                      </button>
                      <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false);
                          handleExportWebsiteLeadsXlsx();
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-200"
                      >
                        <div className="font-medium">💼 Excel — лиды на сайт</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          XLSX с двумя вкладками: «Лиды» + «Производство сайта». Только компании без собственного сайта.
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Recluster — показываем когда выдача завершена, есть компании,
                и хотя бы у одной нет top_pains. Если у всех уже разобрано,
                кнопка не нужна. */}
            {isTerminal &&
              companies.length > 0 &&
              companies.some((c) => !c.top_pains || c.top_pains.length === 0) && (
                <button
                  type="button"
                  onClick={() => void handleReclusterNiche()}
                  disabled={reclusterState === 'queueing' || reclusterState === 'queued'}
                  title={
                    reclusterMsg ||
                    'AI разберёт отзывы и присвоит pain-теги. Занимает 1-3 минуты.'
                  }
                  className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-600 dark:bg-violet-900/40 dark:text-violet-100 dark:hover:bg-violet-900/70"
                >
                  {reclusterState === 'queueing'
                    ? 'Ставлю в очередь…'
                    : reclusterState === 'queued'
                      ? '🧠 AI работает — ~4 мин'
                      : reclusterState === 'error'
                        ? '⚠ Не удалось — повторить'
                        : '🧠 Разобрать боли AI'}
                </button>
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
          <div className="rounded-v2-sm bg-[var(--signal-hot-bg)] px-3 py-2 text-sm text-[color:var(--signal-hot)]">
            Ошибка стрима: {stream.error}
          </div>
        )}

        {search.status === 'failed' && isSoftEmptyError(search.error) && (
          <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-4 py-3 text-sm text-[color:var(--signal-warm)]">
            <div className="font-medium">Ничего не нашлось</div>
            <div className="mt-1 opacity-90">
              По этому запросу 2GIS ничего не вернул. Попробуй переформулировать нишу
              или сменить город.
            </div>
          </div>
        )}

        {search.status === 'failed' && !isSoftEmptyError(search.error) && (
          <div className="rounded-v2-sm border border-[color:var(--signal-hot)]/30 bg-[var(--signal-hot-bg)] px-4 py-3 text-sm text-[color:var(--signal-hot)]">
            <div className="font-medium">Поиск завершился ошибкой</div>
            <div className="mt-1 opacity-90">
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
            <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-4 py-3 text-sm text-[color:var(--signal-warm)]">
              <div className="font-medium">Ничего не нашлось</div>
              <div className="mt-1 opacity-90">{search.error}</div>
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
          <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-4 py-3 text-sm text-[color:var(--signal-warm)]">
            <div className="font-medium">Под выбранные фильтры — 0 компаний.</div>
            <div className="mt-1 opacity-90">
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
                    className="inline-flex items-center gap-1.5 rounded-v2-sm bg-brand-gradient px-2.5 py-1 font-medium text-white shadow-v2-sm hover:shadow-v2-hover"
                  >
                    Добавить выбранные в список
                  </button>
                  <button
                    type="button"
                    disabled={lprBulkBusy}
                    onClick={async () => {
                      const ids = Array.from(selectedIds);
                      setLprBulkBusy(true);
                      setLprBulkMsg(null);
                      try {
                        const r = await enrichCompaniesTeam(search.id, ids);
                        const parts: string[] = [];
                        if (r.queued > 0) parts.push(`${r.queued} ЛПР в очереди`);
                        if (r.skipped_already_has_lpr > 0) parts.push(`${r.skipped_already_has_lpr} уже есть`);
                        if (r.skipped_no_website > 0) parts.push(`${r.skipped_no_website} без сайта`);
                        setLprBulkMsg(parts.join(' · ') || 'нечего обогащать');
                        // Через ~2 минуты ЛПР должны появиться в БД — перезагружаем список.
                        setTimeout(() => void refreshCompanies(filter), 90_000);
                      } catch (e: any) {
                        setLprBulkMsg(e?.message ?? 'Ошибка при запуске обогащения ЛПР');
                      } finally {
                        setLprBulkBusy(false);
                      }
                    }}
                    title="Найти ЛПР (директор/маркетолог) на сайтах выбранных компаний. Идёт в фоне ~2 мин, результат появится в карточках сам."
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {lprBulkBusy ? 'Ставлю в очередь…' : '🧑‍💼 Найти ЛПР'}
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Очистить
                  </button>
                  {lprBulkMsg && (
                    <span className="text-[11px] text-slate-600 dark:text-slate-300" role="status">
                      {lprBulkMsg}
                    </span>
                  )}
                </>
              )}
            </div>
            <ul className="reveal-stack space-y-2.5">
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
                    activeSource={filter.source_filter ?? null}
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
            searchId={search.id}
            activeSource={filter.source_filter ?? 'all'}
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
