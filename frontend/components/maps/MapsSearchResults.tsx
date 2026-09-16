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
import { isUnnamedPainLabel } from '@/lib/painLabels';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Brain,
  ChevronDown,
  Filter,
  Download,
  List,
  Map as MapIcon,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { AddToListModal } from '@/components/maps/AddToListModal';
import { storeBulkKpPending } from '@/lib/kp-bulk-pending';
import { KpModal } from '@/components/maps/KpModal';
import { MapsCompanyCard } from '@/components/maps/MapsCompanyCard';
import { MapsCompanyDetailDrawer } from '@/components/maps/MapsCompanyDetailDrawer';
import { MapsFiltersPanel } from '@/components/maps/MapsFiltersPanel';
import { NicheBenchmarkOverviewBlock } from '@/components/maps/NicheBenchmarkOverviewBlock';
import { useSearchStream } from '@/components/maps/useSearchStream';
import {
  adminReclusterNiche,
  adminReclusterNicheDiagnostic,
  enrichCompaniesTeam,
  exportSearchCsvUrl,
  getMapSearch,
  getMapsAiProgress,
  getNichePainTrend,
  getNicheReviewsTrend,
  listMapCompanies,
  listPainTags,
  type CompanyOut,
  type MapsAiProgressOut,
  type MapsReclusterDiagnosticOut,
  type MapSearchFilter,
  type MapSearchOut,
  type NichePainTrendOut,
  type PainTagOut,
  type SortBy,
} from '@/src/services/api/maps';
import {
  getCompanyAnalyses,
  runPresetAnalysis,
  type CompanyAnalysisOut,
} from '@/src/services/api/reviews-ai';
import type { UserPresetOut } from '@/src/services/api/user-presets';
import { toast } from '@/components/ui/toast';

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

const SOURCE_FILTER_VALUES = new Set(['all', '2gis', 'yandex_maps', 'google_maps']);
function parseSourceFilter(raw: string | null): MapSearchFilter['source_filter'] | undefined {
  if (!raw) return undefined;
  return SOURCE_FILTER_VALUES.has(raw)
    ? (raw as 'all' | '2gis' | 'yandex_maps' | 'google_maps')
    : undefined;
}

// Маппинг шапочного источника отзывов (PainSourceFilter) в источник
// company_sources для фильтра выдачи: 'google' (Review.source) → 'google_maps'
// (CompanySource.source). null → 'all'. Остальные — 1:1.
function painSourceToCompanyFilter(
  raw: '2gis' | 'yandex_maps' | 'google' | null,
): 'all' | '2gis' | 'yandex_maps' | 'google_maps' {
  if (raw === null) return 'all';
  if (raw === 'google') return 'google_maps';
  return raw;
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
    total: number;
    twogis: number;
    yandex_maps: number;
    both: number;
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
  // Постраничная выдача (вид Premium): по PAGE_SIZE компаний, total — с сервера.
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  pageRef.current = page;
  const [listTotal, setListTotal] = useState<number | null>(null);
  // Меняется при «Сбросить всё» у токенов — панель фильтров забывает применённые пресеты.
  const [resetKey, setResetKey] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const listTopRef = useRef<HTMLElement>(null);
  // После смены фильтров оставляем выбранными только компании, попавшие в новую выдачу.
  const pruneSelectionRef = useRef(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  // 2026-06-12 КП-конвейер: вместо preload-генерации и старой DraftEmailModal
  // открываем KpModal с company_id, и модалка сама грузит шаблоны и зовёт
  // /outreach/kp/generate по клику «Сгенерировать». companyName кэшируем
  // в стейт чтобы заголовок модалки сразу был с названием.
  const [kpCompanyId, setKpCompanyId] = useState<number | null>(null);
  const [kpCompanyName, setKpCompanyName] = useState<string | undefined>(undefined);
  // 2026-06-20: модалку bulk-генерации убрали. Кнопка «Сформировать КП»
  // теперь сразу открывает /app/leads/kp-jobs/new?ref=... в НОВОЙ вкладке.
  // На setup-странице юзер выбирает шаблон/тон, после старта попадает на
  // persistent /app/leads/kp-jobs/{id} с таблицей всех компаний и live-
  // прогрессом. Это решает проблему «закрыл модалку — потерял контекст»
  // и автоматически добавляет историю партий в /history.
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
    queued: number;
    cached: number;
    over_limit: number;
    limit_remaining: number;
  } | null>(null);
  const aiPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Защита от повторного автозапуска: эффект ниже триггерит handleTriggerAi
  // ровно один раз — иначе на каждом useEffect re-run он бы дёргал /run-preset-analysis.
  const autoTriggeredRef = useRef(false);
  // Режим отображения выдачи: список или карта. Карта — Leaflet + OSM,
  // загружается ленива через dynamic(), требует координат у компаний.
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  // Recluster (AI-разбор болей ниши). Cron делает это раз в сутки только
  // для top-30 ниш; для редких комбинаций типа «стоматология/Балашиха»
  // company_pain_scores оставался пуст → карточки в fallback. Кнопка
  // даёт юзеру вручную поставить recluster в очередь.
  const [reclusterState, setReclusterState] = useState<'idle' | 'queueing' | 'queued' | 'error'>(
    'idle',
  );
  const [reclusterMsg, setReclusterMsg] = useState<string>('');
  // 2026-06-18: позитивный recluster (sentiment='positive'). Отдельный
  // state, потому что юзер может запустить его параллельно с обычным
  // negative-recluster'ом — это разные celery-задачи и разные наборы
  // тегов. UI «Сильные стороны» опирается на эту кнопку чтобы юзер
  // мог триггернуть генерацию из пустого toggle, без админ-консоли.
  const [positiveReclusterState, setPositiveReclusterState] = useState<
    'idle' | 'queueing' | 'queued' | 'done' | 'timeout' | 'error'
  >('idle');
  const [positiveReclusterMsg, setPositiveReclusterMsg] = useState<string>('');
  // 2026-06-19: количество попыток polling'а после «Запущено». Каждая
  // попытка — listPainTags с sentiment=positive. Когда возвращает >0 →
  // state='done' и плашка empty-state скрывается (тэги уже подтянутся в
  // regionPainTags через основной useEffect). MAX_POSITIVE_POLLS=12 ×
  // 30 сек = 6 минут. Достаточно для типичного recluster (1-3 мин) +
  // запас на quick.
  const [positivePollAttempt, setPositivePollAttempt] = useState<number>(0);
  // Live-прогресс AI-цепочки. Полл каждые 5 сек после клика «Разобрать боли»,
  // чтобы юзер видел реальный прогресс (раньше 4 минуты молча ждали setTimeout).
  // null = не запрашивали; полностью обнуляется при 'ready' с pains > 0.
  const [aiProgress, setAiProgress] = useState<MapsAiProgressOut | null>(null);
  const aiProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Время старта recluster — нужно для детектора «зависло»: если за >3 мин
  // pain_tags_total так и 0 при 100% эмбеддингов, скорее всего recluster
  // упал тихо и нужно дать юзеру кнопку retry.
  const [reclusterStartedAt, setReclusterStartedAt] = useState<number | null>(null);
  // Результат синхронного diagnostic-вызова, чтобы показать его юзеру в stuck-плашке.
  const [diagnostic, setDiagnostic] = useState<MapsReclusterDiagnosticOut | null>(null);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  // ТОП-боли региона (для всей ниши+города поиска). Показываем компактной
  // строкой в шапке: «В этой нише чаще всего жалуются на: …». Юзер просил
  // 2026-06-10 — даёт быстрый «срез» болей региона до раскрытия карточек.
  const [regionPainTags, setRegionPainTags] = useState<PainTagOut[]>([]);
  // Шапка топ-болей: фильтры по источнику отзыва (null = все) и периоду posted_at.
  // Default — последние 90 дней; null source = объединённый агрегат, считается
  // через fast-path (без JOIN reviews).
  type PainSourceFilter = '2gis' | 'yandex_maps' | 'google' | null;
  const [painSourceFilter, setPainSourceFilter] = useState<PainSourceFilter>(null);
  const [painPeriodDays, setPainPeriodDays] = useState<number | null>(90);
  // 2026-06-16: toggle Боли / Сильные стороны. Меняет sentiment в запросах
  // /maps/pain-tags и /maps/insights/demand-index. До прогона recluster по
  // позитиву (отдельный PR) выбор 'positive' покажет пустой список.
  const [painSentiment, setPainSentiment] = useState<'negative' | 'positive'>('negative');
  // Pain-tag, по которому ниже шапки развёрнут inline-chart с динамикой.
  // null = chart скрыт. Кликать в плитке шапки → toggle одновременно
  // фильтра выдачи и видимости chart.
  const [painTagForChart, setPainTagForChart] = useState<PainTagOut | null>(null);
  const [painTrend, setPainTrend] = useState<NichePainTrendOut | null>(null);
  const [painTrendLoading, setPainTrendLoading] = useState(false);
  // 2026-06-12: общая динамика отзывов в нише — всегда висит в шапке выдачи.
  // Юзер: «всегда хочу видеть динамику просто комментариев, неважно
  // негативных или позитивных».
  const [reviewsTrend, setReviewsTrend] = useState<NichePainTrendOut | null>(null);
  const [reviewsTrendLoading, setReviewsTrendLoading] = useState(false);
  // §4.1 ТЗ редизайна — на мобайле фильтр-панель открывается через
  // BottomSheet по кнопке, а не стэкается над списком (было: уезжала
  // и съедала экран ещё до того как юзер увидел компании).
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // 2026-06-16: смена источника в шапке Top-pains теперь меняет ОБА state'а —
  // painSourceFilter (срез pain-tags) и filter.source_filter (фильтр выдачи
  // компаний). Раньше юзер жал «Google» в шапке, ожидая увидеть Google-карточки,
  // а в выдаче оставались 2GIS — фильтры жили независимо.
  const handlePainSourceChange = useCallback((next: '2gis' | 'yandex_maps' | 'google' | null) => {
    setPainSourceFilter(next);
    setFilter((prev) => ({
      ...prev,
      source_filter: painSourceToCompanyFilter(next),
    }));
  }, []);

  const handleFilterChange = useCallback((next: MapSearchFilter) => {
    setFilter(next);
  }, []);

  // Multi-source persistence (§3.1 ТЗ 2026-06-04): синхронизируем
  // filter.source_filter с query-параметром ?src=. router.replace без scroll
  // не вызывает full reload — Next App Router просто меняет URL. Это даёт
  // «возврат по назад/вперёд», переход по ссылке и устойчивость к F5
  // (в рамках сессии где search уже создан в родительском MapsSearchPanel).
  const lastUrlSrcRef = useRef<string | null>(searchParams?.get('src') ?? null);
  useEffect(() => {
    const current =
      filter.source_filter && filter.source_filter !== 'all' ? filter.source_filter : null;
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

  const onDraftEmail = useCallback((c: any) => {
    const id = c.id ?? c.company_id;
    if (id == null) return;
    setKpCompanyId(id);
    setKpCompanyName(c.name ?? undefined);
  }, []);

  const stream = useSearchStream(
    initialMode === 'searching' && !TERMINAL_STATUSES.has(initialSearch.status)
      ? initialSearch.id
      : null,
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
        if (
          updated.status !== search.status ||
          updated.companies_found !== search.companies_found
        ) {
          setSearch(updated);
        }
        // Пока парсер работает — параллельно дёргаем список компаний,
        // чтобы UI наполнялся карточками в реальном времени, а не ждал
        // terminal-статус. Без этого юзер видит пустоту и думает что
        // «ничего не происходит».
        const data = await listMapCompanies(search.id, DEFAULT_FILTER, PAGE_SIZE, 0);
        if (data.items.length > companies.length) {
          setCompanies(data.items);
        }
        setListTotal(data.total);
        if (data.source_counts) setSourceCounts(data.source_counts);
      } catch {
        /* keep current */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [search.id, search.status, search.companies_found, companies.length]);

  // Перезагрузка списка с фильтрами: только после terminal-статуса, с debounce 300мс
  const refreshCompanies = useCallback(
    async (f: MapSearchFilter, p: number = pageRef.current) => {
      setIsLoading(true);
      try {
        const data = await listMapCompanies(search.id, f, PAGE_SIZE, p * PAGE_SIZE);
        setCompanies(data.items);
        setListTotal(data.total);
        setCompaniesEverLoaded(true);
        if (data.source_counts) setSourceCounts(data.source_counts);
        if (pruneSelectionRef.current) {
          pruneSelectionRef.current = false;
          const visible = new Set(data.items.map((c) => c.id));
          setSelectedIds((prev) => {
            const next = new Set(Array.from(prev).filter((cid) => visible.has(cid)));
            return next.size === prev.size ? prev : next;
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [search.id],
  );

  // Смена фильтров — на первую страницу. Выбор сверяем с новой выдачей после загрузки
  // (раньше «Выбрано: 1» оставалось, хотя компания из выдачи пропала).
  const filterKey = JSON.stringify(filter);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (filterKey === lastFilterKey.current) return;
    lastFilterKey.current = filterKey;
    setPage(0);
    pruneSelectionRef.current = true;
  }, [filterKey]);

  useEffect(() => {
    if (!isTerminal) return;
    const timer = setTimeout(() => {
      void refreshCompanies(filter, page);
    }, 300);
    return () => clearTimeout(timer);
  }, [filter, page, isTerminal, refreshCompanies]);

  const goToPage = useCallback((next: number) => {
    setPage(Math.max(0, next));
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Список для отображения: после того, как companies хотя бы раз были
  // загружены через listMapCompanies, ВСЕГДА используем их (даже если 0).
  // Иначе фильтр, отдавший 0 компаний, тихо подменялся бы на нефильтрованную
  // live-ленту и юзер думал бы, что фильтр не работает.
  // Live-стрим используется только пока companies ещё ни разу не приходили
  // (первоначальная загрузка — пока парсер ещё не дошёл до terminal-статуса).
  //
  // 2026-06-12: ранее тут стоял client-side safety filter по filter.has_website
  // — но SSE-event компании НЕ содержит поля website (см. sse._company_to_event),
  // поэтому фильтр для has_website=true НА live-stream скрывал ВСЕ карточки,
  // а для has_website=false — пропускал все включая компании с сайтом. Убран.
  // Полагаемся на серверный applyFilters (filters.py:91-100), который
  // фильтрует корректно через btrim(coalesce(website, '')) = ''. Live-stream
  // используется только пока бэк ещё не отработал — после listMapCompanies
  // мы переключаемся на серверную выдачу.
  const liveCompanies = stream.companies;
  const baseList: any[] = companiesEverLoaded || companies.length > liveCompanies.length ? companies : liveCompanies;
  const renderTotal = baseList.length;

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

  const onUserPresetWithAi = useCallback(
    (preset: UserPresetOut) => {
      setActiveAiPreset(preset);
      setAiAnalyses(new Map());
      setAiLastRun(null);
      stopAiPolling();
    },
    [stopAiPolling],
  );

  const handleTriggerAi = useCallback(async () => {
    if (!activeAiPreset || visibleCompanyIds.length === 0 || aiTriggering) return;
    // Backend ограничивает один POST не более чем AI_RUN_MAX компаниями. Если
    // в выдаче больше — раньше прилетал 422 «Не удалось запустить AI-анализ»
    // без объяснений. Теперь — режем сами и предупреждаем юзера, чтобы он
    // понял, почему обработались не все.
    const AI_RUN_MAX = 500;
    let ids = visibleCompanyIds;
    if (ids.length > AI_RUN_MAX) {
      toast.info(
        `Видимых компаний ${ids.length}, AI-анализ за один запуск обрабатывает максимум ${AI_RUN_MAX}. ` +
          `Запускаю на первых ${AI_RUN_MAX}. Сузь фильтры и нажми ещё раз для остальных.`,
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
        aiPollTimer.current = setInterval(() => {
          void fetchAnalyses();
        }, 3000);
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
      toast.error(msg);
    } finally {
      setAiTriggering(false);
    }
  }, [activeAiPreset, visibleCompanyIds, aiTriggering, fetchAnalyses, stopAiPolling]);

  // Останавливаем поллинг при размонтировании
  useEffect(() => stopAiPolling, [stopAiPolling]);

  const stopAiProgressPolling = useCallback(() => {
    if (aiProgressTimer.current) {
      clearInterval(aiProgressTimer.current);
      aiProgressTimer.current = null;
    }
  }, []);

  const fetchAiProgressOnce = useCallback(async () => {
    try {
      const p = await getMapsAiProgress(search.id);
      setAiProgress(p);
      // Как только pain-теги начали появляться у трети компаний — подтягиваем
      // выдачу, чтобы юзер сразу увидел плитки. Останавливаем polling,
      // когда у всех компаний с отзывами уже есть pain-теги.
      if (p.stage === 'ready' && p.companies_with_pains > 0) {
        void refreshCompanies(filter);
      }
      if (
        p.stage === 'ready' &&
        p.companies_with_pains >= Math.max(1, Math.floor(p.companies_total * 0.6))
      ) {
        stopAiProgressPolling();
      }
    } catch {
      // silent — следующий тик повторит
    }
  }, [search.id, refreshCompanies, filter, stopAiProgressPolling]);

  const handleReclusterNiche = useCallback(async () => {
    if (reclusterState === 'queueing' || reclusterState === 'queued') return;
    setReclusterState('queueing');
    setReclusterMsg('');
    setAiProgress(null);
    try {
      const result = await adminReclusterNiche(search.id);
      setReclusterState('queued');
      setReclusterMsg(result.hint);
      setReclusterStartedAt(Date.now());
      // Сразу запрашиваем прогресс и стартуем polling каждые 5 сек.
      // Прогресс-бар в шапке выдачи покажет юзеру что цепочка реально работает.
      void fetchAiProgressOnce();
      stopAiProgressPolling();
      aiProgressTimer.current = setInterval(() => {
        void fetchAiProgressOnce();
      }, 5000);
      // Финальный safety-refresh на ~6 минуте — если polling по какой-то
      // причине прекратился, выдача всё равно обновится.
      window.setTimeout(() => {
        void refreshCompanies(filter);
        stopAiProgressPolling();
      }, 360_000);
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
  }, [
    reclusterState,
    search.id,
    refreshCompanies,
    filter,
    fetchAiProgressOnce,
    stopAiProgressPolling,
  ]);

  useEffect(() => stopAiProgressPolling, [stopAiProgressPolling]);

  // Подтягиваем pain-теги (niche, city) для шапки «ТОП-боли региона».
  // Источник — /maps/pain-tags (niche+city с опциональным source/from/to —
  // пересчёт occurrences по подмножеству отзывов). Перезапрашиваем при
  // изменении aiProgress.pain_tags_total — после recluster обновляется без
  // ручного refresh. Также при смене source/period.
  useEffect(() => {
    let mounted = true;
    if (!search?.niche) return;
    const from =
      painPeriodDays != null
        ? new Date(Date.now() - painPeriodDays * 86_400_000).toISOString().slice(0, 10)
        : undefined;
    listPainTags(search.niche, search.city ?? undefined, {
      source: painSourceFilter ?? undefined,
      from,
      sentiment: painSentiment,
    })
      .then((data) => {
        if (mounted) setRegionPainTags(data);
      })
      .catch(() => {
        if (mounted) setRegionPainTags([]);
      });
    return () => {
      mounted = false;
    };
  }, [
    search?.niche,
    search?.city,
    aiProgress?.pain_tags_total,
    painSourceFilter,
    painPeriodDays,
    painSentiment,
    // 2026-06-19: после positive-recluster нужно перезапросить регионные
    // теги, чтобы плитки «Сильные стороны» появились без F5.
    positivePollAttempt,
  ]);

  // 2026-06-19: автополлинг positive recluster. После клика «Запустить»
  // (state='queued') каждые 30 сек дёргаем listPainTags для positive.
  // Когда возвращает ≥1 — state='done', плашка empty-state скрывается.
  // Через 6 минут (12 попыток) — state='timeout' с подсказкой проверить
  // вручную / попробовать ещё раз.
  useEffect(() => {
    if (positiveReclusterState !== 'queued') return;
    if (!search?.niche) return;
    const MAX_POSITIVE_POLLS = 12;
    const POSITIVE_POLL_MS = 30_000;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const tags = await listPainTags(search.niche, search.city ?? undefined, {
          sentiment: 'positive',
        });
        if (cancelled) return;
        if (tags.length > 0) {
          setPositiveReclusterState('done');
          setPositiveReclusterMsg(
            `Готово · создано ${tags.length} плиток сильных сторон. Можно листать выдачу.`,
          );
          // Триггерим перезагрузку regionPainTags — увеличиваем счётчик,
          // основной useEffect его читает в deps.
          setPositivePollAttempt((x) => x + 1);
          return;
        }
      } catch {
        // тихо — следующая попытка попробует ещё раз
      }
      setPositivePollAttempt((x) => {
        const next = x + 1;
        if (next >= MAX_POSITIVE_POLLS) {
          setPositiveReclusterState('timeout');
          setPositiveReclusterMsg(
            'Не дождались плиток за 6 минут. Возможно recluster ' +
              'упал (мало позитивных отзывов или LLM не ответил). ' +
              'Попробуй нажать «Запустить» ещё раз.',
          );
        }
        return next;
      });
    };
    const id = setInterval(tick, POSITIVE_POLL_MS);
    // первый тик через 30 сек (не сразу — бэку нужно время посчитать)
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [positiveReclusterState, search?.niche, search?.city]);

  // 2026-06-12: общая динамика отзывов в нише — грузим всегда, не зависит
  // от выбранной плитки. Перезагружается при смене ниши/города/источника/окна.
  useEffect(() => {
    if (!search?.niche) {
      setReviewsTrend(null);
      return;
    }
    let mounted = true;
    setReviewsTrendLoading(true);
    const from =
      painPeriodDays != null
        ? new Date(Date.now() - painPeriodDays * 86_400_000).toISOString().slice(0, 10)
        : undefined;
    getNicheReviewsTrend(search.niche, search.city ?? null, painSourceFilter ?? undefined, from)
      .then((d) => {
        if (mounted) setReviewsTrend(d);
      })
      .catch(() => {
        if (mounted) setReviewsTrend(null);
      })
      .finally(() => {
        if (mounted) setReviewsTrendLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [search?.niche, search?.city, painSourceFilter, painPeriodDays]);

  // Подтягиваем trend для inline-chart, когда юзер кликнул плитку.
  useEffect(() => {
    if (!painTagForChart || !search?.niche) {
      setPainTrend(null);
      return;
    }
    let mounted = true;
    setPainTrendLoading(true);
    const from =
      painPeriodDays != null
        ? new Date(Date.now() - painPeriodDays * 86_400_000).toISOString().slice(0, 10)
        : undefined;
    getNichePainTrend(
      search.niche,
      painTagForChart.id,
      search.city ?? null,
      painSourceFilter ?? undefined,
      from,
    )
      .then((d) => {
        if (mounted) setPainTrend(d);
      })
      .catch(() => {
        if (mounted) setPainTrend(null);
      })
      .finally(() => {
        if (mounted) setPainTrendLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [painTagForChart, search?.niche, search?.city, painSourceFilter, painPeriodDays]);

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
  }, [
    activeAiPreset,
    isTerminal,
    visibleCompanyIds.length,
    aiTriggering,
    aiLastRun,
    handleTriggerAi,
  ]);

  // Если юзер вручную выбрал другой AI-пресет (через MapsFiltersPanel) —
  // разрешаем автозапуск снова. onUserPresetWithAi сбрасывает aiLastRun,
  // используем это как сигнал.
  useEffect(() => {
    if (!aiLastRun) autoTriggeredRef.current = false;
  }, [aiLastRun]);

  const aiDoneCount = Array.from(aiAnalyses.values()).filter((x) => x.status === 'done').length;
  const aiPendingCount = Array.from(aiAnalyses.values()).filter(
    (x) => x.status === 'pending',
  ).length;

  // UI-only сортировка по AI score: бэк про неё не знает (sort_by Literal-enum),
  // делаем на клиенте поверх baseList. Компании без AI-score (или с failed) —
  // в конец, независимо от направления, чтобы сверху всегда был содержательный
  // результат, а не пустые карточки.
  //
  // 2026-07-13: defensive dedup по (id ?? company_id) — 12.07 юзер видел
  // одну карточку дважды при том что selectedIds не дублировался. Каждый
  // отдельный setCompanies/liveCompanies источник корректен, но добавляем
  // страховку на случай гонок при переключении с SSE на серверную выдачу.
  const renderList: any[] = (() => {
    const sorted = (() => {
      if (filter.sort_by !== 'ai_score_desc' && filter.sort_by !== 'ai_score_asc') {
        return baseList;
      }
      const direction = filter.sort_by === 'ai_score_asc' ? 1 : -1;
      const withScore = baseList.map((c) => {
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
    const seen = new Set<number>();
    const out: any[] = [];
    for (const c of sorted) {
      const id = (c.id ?? c.company_id) as number | undefined;
      if (typeof id === 'number') {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(c);
    }
    return out;
  })();

  function downloadUrl(url: string, filename: string) {
    // Простой способ для same-origin прокси: тег <a download>
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function handleExport() {
    downloadUrl(exportSearchCsvUrl(search.id, filter), `maps_search_${search.id}.csv`);
  }

  function handleExportSelected() {
    if (selectedIds.size === 0) return;
    downloadUrl(exportSearchCsvUrl(search.id, filter, Array.from(selectedIds)), `maps_search_${search.id}_selected.csv`);
  }

  function handleExportWebsiteLeadsXlsx() {
    // Блок 4 ТЗ 2026-06-02: .xlsx с двумя вкладками для пакетной продажи сайтов.
    downloadUrl(`/api/v1/maps/website-leads/export?search_id=${search.id}&only_website_leads=true`, `website-leads_${search.id}.xlsx`);
  }

  const pageIds = renderList
    .map((c: any) => (c.id ?? c.company_id) as number | undefined)
    .filter((x): x is number => typeof x === 'number');
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((cid) => selectedIds.has(cid));

  function toggleAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((cid) => next.delete(cid));
      else pageIds.forEach((cid) => next.add(cid));
      return next;
    });
  }

  // КП по выбранным, а если ничего не выбрано — по всем компаниям на странице.
  // Снимок id — в localStorage под одноразовым ключом: у новой вкладки свой sessionStorage,
  // а в URL 500 id не влезают. Партия попадёт в «История → Партии КП».
  function handleBulkKp() {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : pageIds;
    if (ids.length === 0) return;
    const ref = storeBulkKpPending(ids);
    window.open(`/app/leads/kp-jobs/new?ref=${ref}`, '_blank', 'noopener');
  }

  async function handleBulkLpr() {
    const ids = Array.from(selectedIds);
    setLprBulkBusy(true);
    try {
      const r = await enrichCompaniesTeam(search.id, ids);
      const parts: string[] = [];
      if (r.queued > 0) parts.push(`Ищу руководителя на ${r.queued} сайт${r.queued === 1 ? 'е' : 'ах'} — карточки обновятся через ~2 мин`);
      if (r.skipped_already_has_lpr > 0) parts.push(`${r.skipped_already_has_lpr} уже с ЛПР`);
      if (r.skipped_no_website > 0) parts.push(`${r.skipped_no_website} без сайта — искать негде`);
      toast.info(parts.join(' · ') || 'У всех выбранных компаний ЛПР уже найден.');
      // Через ~2 минуты ЛПР должны появиться в БД — перезагружаем список.
      setTimeout(() => void refreshCompanies(filter), 90_000);
    } catch (e: any) {
      toast.error(e?.message ?? 'Не удалось запустить поиск ЛПР');
    } finally {
      setLprBulkBusy(false);
    }
  }

  const tokens = filterTokens(filter, regionPainTags);

  function resetAllFilters() {
    handleFilterChange({ ...EMPTY_FILTER, sort_by: filter.sort_by ?? 'rating_desc' });
    setResetKey((k) => k + 1);
  }

  const foundCount = search.companies_found ?? listTotal ?? renderTotal;
  const shownTotal = listTotal ?? renderTotal;
  const rangeFrom = shownTotal === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeTo = page * PAGE_SIZE + renderList.length;
  const titlePlace =
    search.mode === 'radius' && search.address
      ? `${search.address}, ${((search.radius_meters ?? 0) / 1000).toFixed(1)} км`
      : search.city;
  const unparsedCount = isTerminal ? companies.filter((c) => !c.top_pains || c.top_pains.length === 0).length : 0;

  const filtersPanel = (mobile: boolean) => (
    <MapsFiltersPanel
      niche={search.niche}
      city={search.city}
      searchId={search.id}
      value={filter}
      onChange={handleFilterChange}
      onUserPresetWithAiSelected={(p) => {
        onUserPresetWithAi(p);
        if (mobile) setMobileFiltersOpen(false);
      }}
      sourceCounts={sourceCounts}
      resetKey={resetKey}
    />
  );

  return (
    <div className={cn(selectedIds.size > 0 && 'pb-24')}>
      {/* === Шапка: запрос, счётчики, главные действия === */}
      <button
        type="button"
        onClick={onNewSearch}
        className="mb-3 inline-flex items-center gap-1.5 rounded-control text-small font-semibold text-ui-text-muted hover:text-ui-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Новый поиск
      </button>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-heading font-extrabold tracking-tight text-ui-text">
            {capitalize(search.niche)} · {titlePlace}.
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-small text-ui-text-muted">
            <span>
              {isTerminal ? 'Найдено' : 'Уже найдено'} <b className="font-semibold tabular-nums text-ui-text">{foundCount}</b>
            </span>
            {isTerminal && tokens.length > 0 && (
              <span>
                под фильтры <b className="font-semibold tabular-nums text-ui-text">{shownTotal}</b>
              </span>
            )}
            {sourceNames(search.sources) && <span>{sourceNames(search.sources)}</span>}
            {search.status === 'from_cache' && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-ui-accent/[.08] px-2.5 py-0.5 text-xs font-semibold text-ui-accent"
                title="Не парсили заново — взяли ранее собранную выдачу"
              >
                <Zap className="h-3 w-3" aria-hidden /> из кэша
              </span>
            )}
            {search.status === 'failed' && (
              <span className="rounded-full bg-ui-danger/10 px-2.5 py-0.5 text-xs font-semibold text-ui-danger">ошибка</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
          {isTerminal && foundCount > 0 && (
            <div className="relative">
              <Button
                variant="secondary"
                onClick={() => setExportMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
                iconLeft={<Download />}
                className="h-11"
              >
                Экспорт
              </Button>
              {exportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setExportMenuOpen(false)} aria-hidden />
                  <div
                    role="menu"
                    className="absolute right-0 z-40 mt-2 w-72 rounded-card border border-black/[.06] bg-ui-surface p-1.5 shadow-overlay"
                  >
                    <ExportItem
                      title="CSV — все компании"
                      hint="с учётом текущих фильтров"
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleExport();
                      }}
                    />
                    <ExportItem
                      title={`CSV — выбранные${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
                      hint={selectedIds.size === 0 ? 'отметьте карточки галочками' : 'только отмеченные карточки'}
                      disabled={selectedIds.size === 0}
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleExportSelected();
                      }}
                    />
                    <ExportItem
                      title="Excel — лиды на сайт"
                      hint="Две вкладки: «Лиды» и «Производство сайта». Только компании без своего сайта."
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleExportWebsiteLeadsXlsx();
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <Button
            onClick={handleBulkKp}
            disabled={pageIds.length === 0}
            iconLeft={<Send />}
            className="h-11 px-6"
            title={
              selectedIds.size > 0
                ? 'Откроется новая вкладка: шаблон и тон → старт. Партия попадёт в «История → Партии КП».'
                : 'КП для всех компаний на странице. Чтобы выбрать отдельные — отметьте карточки галочками.'
            }
          >
            Сформировать КП{selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}
          </Button>
        </div>
      </div>

      {/* === Идёт сбор === */}
      {!isTerminal &&
        (() => {
          const p = stream.progress;
          const saved = p?.saved ?? p?.companies_processed ?? p?.processed;
          const expected = p?.expected ?? p?.companies_total ?? p?.total;
          // Пока бэк не прислал прогресса — считаем по пришедшим компаниям.
          const done = typeof saved === 'number' && saved > 0 ? saved : Math.max(stream.companies.length, companies.length);
          const pct = typeof expected === 'number' && expected > 0 ? Math.min(100, Math.round((done / expected) * 100)) : null;
          return (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-small text-ui-text-muted">
                <span>
                  <b className="font-semibold text-ui-text">Идёт сбор:</b> {p?.source ? `${sourceNames(p.source)} · ` : ''}
                  {pct != null ? (
                    <>
                      компания <b className="font-semibold tabular-nums text-ui-text">{done}</b> из{' '}
                      <b className="font-semibold tabular-nums text-ui-text">{expected}</b>
                    </>
                  ) : done > 0 ? (
                    <>
                      уже найдено <b className="font-semibold tabular-nums text-ui-text">{done}</b>
                    </>
                  ) : (
                    'запускаю парсер, жду первых ответов источника…'
                  )}
                </span>
                <span
                  role="progressbar"
                  aria-label="Прогресс сбора"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct ?? undefined}
                  className="relative h-1.5 min-w-[140px] flex-1 overflow-hidden rounded-full bg-ui-border"
                >
                  {pct != null ? (
                    <span className="absolute inset-y-0 left-0 rounded-full bg-ui-accent transition-all duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
                  ) : (
                    <span className="absolute inset-y-0 left-0 w-1/3 animate-pulse rounded-full bg-ui-accent" />
                  )}
                </span>
                {pct != null && <span className="text-small font-semibold tabular-nums text-ui-accent">{pct}%</span>}
              </div>
              {stream.reconnectAttempt > 0 && !stream.error && (
                <p className="mt-1.5 text-xs text-ui-warning">
                  Связь прервалась, переподключаюсь (попытка {stream.reconnectAttempt}). Парсер продолжает работу.
                </p>
              )}
            </div>
          );
        })()}

      {/* === Активные фильтры токенами === */}
      {tokens.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ui-text-muted">Фильтры:</span>
          {tokens.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-ui-border bg-ui-surface py-1 pl-3.5 pr-1.5 text-small font-semibold text-ui-text shadow-raised"
            >
              {t.label}
              <button
                type="button"
                onClick={() => handleFilterChange({ ...filter, ...t.patch })}
                aria-label={`Убрать фильтр: ${t.label}`}
                className="grid h-[18px] w-[18px] place-items-center rounded-full bg-ui-surface-2 text-ui-text-muted hover:bg-ui-danger/10 hover:text-ui-danger"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          <button type="button" onClick={resetAllFilters} className="px-2 py-1 text-small font-semibold text-ui-danger hover:underline">
            Сбросить всё
          </button>
        </div>
      )}

      {/* === AI-пресет === */}
      {activeAiPreset && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-ui-accent/[.06] px-4 py-2.5 text-small">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ui-text">
            <Sparkles className="h-4 w-4 text-ui-accent" aria-hidden />
            AI-пресет «{activeAiPreset.name}»
          </span>
          <span className="text-ui-text-muted">
            {aiDoneCount > 0 || aiPendingCount > 0
              ? `готово ${aiDoneCount} · в работе ${aiPendingCount}`
              : !isTerminal
                ? 'анализ запустится сам, когда сбор закончится'
                : aiTriggering
                  ? 'запускаю анализ компаний на странице…'
                  : 'анализ запустится автоматически'}
          </span>
          <Button
            size="sm"
            onClick={() => void handleTriggerAi()}
            disabled={aiTriggering || visibleCompanyIds.length === 0}
            className="ml-auto"
          >
            {aiTriggering ? 'Запускаю…' : `Запустить AI-анализ · ${visibleCompanyIds.length}`}
          </Button>
          {aiLastRun && (
            <p className="basis-full text-xs text-ui-text-muted">
              Поставлено: {aiLastRun.queued}, из кэша: {aiLastRun.cached}
              {aiLastRun.over_limit > 0 && <span className="text-ui-danger"> · {aiLastRun.over_limit} не ушло — дневной лимит исчерпан</span>}
              {' · '}остаток лимита на сутки: {aiLastRun.limit_remaining}
            </p>
          )}
        </div>
      )}

      {/* === Прогресс AI-разбора болей === */}
      {reclusterState === 'queued' && (
        <div className="mt-4">
          <AiPainProgressBar
            progress={aiProgress}
            startedAt={reclusterStartedAt}
            diagnostic={diagnostic}
            diagnosticRunning={diagnosticRunning}
            onDismiss={() => {
              setReclusterState('idle');
              setAiProgress(null);
              setReclusterStartedAt(null);
              setDiagnostic(null);
              stopAiProgressPolling();
            }}
            onRestart={() => {
              setReclusterState('idle');
              setAiProgress(null);
              setReclusterStartedAt(null);
              setDiagnostic(null);
              stopAiProgressPolling();
              void handleReclusterNiche();
            }}
            onRunDiagnostic={async () => {
              setDiagnosticRunning(true);
              setDiagnostic(null);
              try {
                const r = await adminReclusterNicheDiagnostic(search.id);
                setDiagnostic(r);
                // Если diagnostic создал теги — сразу подтянем выдачу
                if (r.companies_with_pains_after > 0) void refreshCompanies(filter);
              } catch (e) {
                const err = e as { response?: { data?: { detail?: unknown } } };
                const detail = err?.response?.data?.detail;
                setDiagnostic({
                  search_id: search.id,
                  niche: search.niche,
                  city: search.city,
                  companies_total: 0,
                  reviews_with_embedding: 0,
                  clusters_found: 0,
                  pain_tags_upserted: 0,
                  companies_with_pains_after: 0,
                  error: typeof detail === 'string' ? detail : 'Не удалось выполнить diagnostic (timeout/500)',
                });
              } finally {
                setDiagnosticRunning(false);
              }
            }}
          />
        </div>
      )}

      {/* === Сводка по нише — свёрнута: частые жалобы, динамика, сравнение === */}
      <details
        open={summaryOpen}
        onToggle={(e) => setSummaryOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="group mt-5 rounded-panel border border-black/[.06] bg-ui-surface shadow-raised"
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-panel px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 text-base font-bold text-ui-text">Сводка по нише</span>
          <span className="hidden min-w-0 truncate text-small text-ui-text-muted sm:block">
            {regionPainTags.length > 0
              ? `чаще всего жалуются: ${regionPainTags
                  .filter((t) => !isUnnamedPainLabel(t.label))
                  .slice(0, 3)
                  .map((t) => t.label.toLowerCase())
                  .join(', ')}`
              : 'частые жалобы, динамика отзывов, сравнение компаний'}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ui-text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        {summaryOpen && (
          <div className="border-t border-black/[.06] px-5 pb-5 pt-4">
            <PainHeaderControlsBar
              sourceFilter={painSourceFilter}
              onSourceFilterChange={handlePainSourceChange}
              periodDays={painPeriodDays}
              onPeriodChange={setPainPeriodDays}
              sentiment={painSentiment}
              onSentimentChange={setPainSentiment}
            />
            {painSentiment === 'positive' && regionPainTags.length === 0 && (
              <div className="mt-3 rounded-card bg-ui-surface-2 p-4 text-small text-ui-text-muted">
                <p className="font-semibold text-ui-text">Сильные стороны ниши ещё не посчитаны</p>
                <p className="mt-1">
                  AI разбирает позитивные отзывы отдельно от негативных. Нажмите «Запустить» — через 2–4 минуты появятся плитки: за что
                  клиенты хвалят компании в этом городе.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={positiveReclusterState === 'queueing' || positiveReclusterState === 'queued'}
                    onClick={async () => {
                      setPositiveReclusterState('queueing');
                      setPositiveReclusterMsg('');
                      setPositivePollAttempt(0);
                      try {
                        const r = await adminReclusterNiche(search.id, 'positive');
                        setPositiveReclusterState('queued');
                        setPositiveReclusterMsg(r.hint || 'Поставлено в очередь.');
                      } catch (e: any) {
                        setPositiveReclusterState('error');
                        setPositiveReclusterMsg(e?.response?.data?.detail || e?.message || 'Не удалось поставить задачу.');
                      }
                    }}
                  >
                    {positiveReclusterState === 'queueing'
                      ? 'Ставлю в очередь…'
                      : positiveReclusterState === 'queued'
                        ? `Жду плитки · попытка ${positivePollAttempt + 1}/12`
                        : positiveReclusterState === 'done'
                          ? 'Готово'
                          : positiveReclusterState === 'timeout'
                            ? 'Запустить ещё раз'
                            : 'Запустить'}
                  </Button>
                  {positiveReclusterMsg && (
                    <span className={cn('text-xs', positiveReclusterState === 'error' ? 'text-ui-danger' : 'text-ui-text-muted')}>
                      {positiveReclusterMsg}
                    </span>
                  )}
                </div>
              </div>
            )}
            {regionPainTags.length > 0 && (
              <RegionPainSummary
                tags={regionPainTags}
                niche={search.niche}
                city={search.city}
                activeIds={filter.pain_tag_ids ?? []}
                onToggle={(tagId) => {
                  const current = filter.pain_tag_ids ?? [];
                  const next = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
                  handleFilterChange({ ...filter, pain_tag_ids: next.length > 0 ? next : null });
                  // Открываем/закрываем график на том же клике.
                  const tag = regionPainTags.find((t) => t.id === tagId) ?? null;
                  setPainTagForChart((prev) => (prev?.id === tagId ? null : tag));
                }}
                onClear={() => {
                  handleFilterChange({ ...filter, pain_tag_ids: null });
                  setPainTagForChart(null);
                }}
              />
            )}
            <RegionPainTrendInline
              tag={painTagForChart}
              trend={painTagForChart ? painTrend : reviewsTrend}
              loading={painTagForChart ? painTrendLoading : reviewsTrendLoading}
              headline="Динамика отзывов в нише"
              onClose={painTagForChart ? () => setPainTagForChart(null) : undefined}
            />
            <NicheBenchmarkOverviewBlock
              niche={search.niche}
              city={search.city}
              activePainTagIds={filter.pain_tag_ids ?? []}
              sentiment={painSentiment}
              onPainClick={(tagId) => {
                const current = filter.pain_tag_ids ?? [];
                const next = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
                handleFilterChange({ ...filter, pain_tag_ids: next.length > 0 ? next : null });
              }}
            />
          </div>
        )}
      </details>

      {/* === Фильтры слева, компании справа === */}
      <div className="mt-6 grid grid-cols-1 gap-7 lg:grid-cols-[272px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <div className="sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto pb-4 pr-1 [scrollbar-width:thin]">
            {filtersPanel(false)}
          </div>
        </div>

        <BottomSheet open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} title="Фильтры" maxHeight="92vh">
          {filtersPanel(true)}
          <div className="sticky bottom-0 -mx-4 mt-3 border-t border-ui-border bg-ui-surface px-4 py-3">
            <Button onClick={() => setMobileFiltersOpen(false)} className="w-full">
              Показать компании
            </Button>
          </div>
        </BottomSheet>

        <section ref={listTopRef} aria-label="Компании" className="min-w-0 scroll-mt-20">
          <div className="mb-4 flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMobileFiltersOpen(true)}
              iconLeft={<SlidersHorizontal />}
              className="lg:hidden"
            >
              Фильтры{tokens.length > 0 ? ` · ${tokens.length}` : ''}
            </Button>
            {renderTotal > 0 && (
              <Segmented
                size="sm"
                aria-label="Вид выдачи"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  {
                    value: 'list',
                    label: (
                      <>
                        <List className="h-3.5 w-3.5" aria-hidden /> Список
                      </>
                    ),
                  },
                  {
                    value: 'map',
                    label: (
                      <>
                        <MapIcon className="h-3.5 w-3.5" aria-hidden /> Карта
                      </>
                    ),
                  },
                ]}
              />
            )}
            {renderTotal > 0 && (
              <span className="text-small text-ui-text-muted">
                <b className="font-semibold tabular-nums text-ui-text">
                  {rangeFrom}–{rangeTo}
                </b>{' '}
                из <b className="font-semibold tabular-nums text-ui-text">{shownTotal}</b>
              </span>
            )}
            {renderList.length > 0 && viewMode === 'list' && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-small text-ui-text-muted hover:text-ui-text">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  className="h-4 w-4 cursor-pointer accent-[hsl(var(--color-accent))]"
                />
                все на странице
              </label>
            )}
            <div className="flex items-center gap-2 text-small text-ui-text-muted sm:ml-auto">
              <label htmlFor="results-sort">Сорт.</label>
              <Select
                id="results-sort"
                value={filter.sort_by ?? 'rating_desc'}
                onChange={(e) => handleFilterChange({ ...filter, sort_by: e.target.value as SortBy })}
                className="min-w-[210px]"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                {activeAiPreset != null && (
                  <>
                    <option value="ai_score_desc">AI-оценка: высокие сверху</option>
                    <option value="ai_score_asc">AI-оценка: низкие сверху</option>
                  </>
                )}
              </Select>
            </div>
          </div>

          {unparsedCount > 0 && reclusterState !== 'queued' && (
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-ui-surface-2 px-4 py-2.5 text-small text-ui-text-muted">
              <Brain className="h-4 w-4 shrink-0 text-ui-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                {reclusterState === 'error' ? (
                  <span className="text-ui-danger">{reclusterMsg || 'Не удалось поставить разбор в очередь.'}</span>
                ) : (
                  <>
                    У {unparsedCount} {plural(unparsedCount, 'компании', 'компаний', 'компаний')} на странице боли ещё не разобраны — AI
                    прочитает отзывы за 3–5 минут.
                  </>
                )}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleReclusterNiche()}
                disabled={reclusterState === 'queueing'}
                className="bg-ui-surface shadow-raised hover:bg-ui-surface"
              >
                {reclusterState === 'queueing' ? 'Ставлю в очередь…' : reclusterState === 'error' ? 'Повторить' : 'Разобрать боли AI'}
              </Button>
            </div>
          )}

          {stream.error && !isSoftEmptyError(search.error) && search.status !== 'completed' && (
            <Notice tone="warning" title="Живое обновление приостановлено">
              Сервер закрыл соединение после 3 попыток. Парсер продолжает работу в фоне — обновите страницу через пару минут.
            </Notice>
          )}

          {search.status === 'failed' && isSoftEmptyError(search.error) && (
            <Notice tone="warning" title="Ничего не нашлось" action={<Button size="sm" variant="secondary" onClick={onNewSearch}>Новый поиск</Button>}>
              По этому запросу 2GIS ничего не вернул. Переформулируйте нишу или смените город.
            </Notice>
          )}

          {search.status === 'failed' && !isSoftEmptyError(search.error) && (
            <Notice tone="danger" title="Поиск завершился ошибкой">
              {search.error_type === 'ConnectTimeout' ? (
                '2GIS API не отвечает (TLS-таймаут). Чаще всего это сеть провайдера — попробуйте позже.'
              ) : search.error_type === 'MissingAPIKeyError' ? (
                <>
                  Ключ провайдера карт не настроен или неверный. Проверьте ключи в{' '}
                  <a href="/app/settings/maps-providers" className="font-semibold underline">
                    настройках провайдеров карт
                  </a>
                  .
                </>
              ) : search.error_type === 'ProviderUnavailable' ? (
                search.error || 'Источник временно недоступен (капча или лимит запросов). Попробуйте позже или смените источник.'
              ) : (
                search.error || `${search.error_type ?? 'Неизвестная ошибка'}.`
              )}
            </Notice>
          )}

          {search.status === 'completed' &&
            (search.error_type === 'MissingAPIKeyError' || search.error_type === 'ProviderUnavailable') &&
            renderTotal === 0 && (
              <Notice
                tone="danger"
                title={search.error_type === 'MissingAPIKeyError' ? 'Ключ провайдера карт не настроен' : 'Источник временно недоступен'}
              >
                {search.error_type === 'MissingAPIKeyError' ? (
                  <>
                    Поэтому сбор не выполнен. Обновите ключи в{' '}
                    <a href="/app/settings/maps-providers" className="font-semibold underline">
                      настройках провайдеров карт
                    </a>
                    .
                  </>
                ) : (
                  search.error || 'Провайдер встал в капчу или превысил лимит запросов. Попробуйте позже или смените источник.'
                )}
              </Notice>
            )}

          {search.status === 'completed' && search.error_type === 'EmptyResult' && renderTotal === 0 && (
            <Notice tone="warning" title="Ничего не нашлось" action={<Button size="sm" variant="secondary" onClick={onNewSearch}>Новый поиск</Button>}>
              {search.error}
              {reviewsTrend && reviewsTrend.companies_affected > 0 && (
                <span className="mt-1 block">
                  В базе уже есть {reviewsTrend.companies_affected}{' '}
                  {plural(reviewsTrend.companies_affected, 'компания', 'компании', 'компаний')} этой ниши из прошлых поисков — по ним
                  считается «Сводка по нише».
                </span>
              )}
            </Notice>
          )}

          {isLoading && renderList.length === 0 && search.status !== 'failed' && (
            <p className="rounded-card bg-ui-surface-2 px-4 py-6 text-center text-small text-ui-text-muted">
              {isTerminal ? 'Загружаю компании по фильтрам…' : 'Парсер ищет компании — карточки появятся по мере готовности.'}
            </p>
          )}

          {!isLoading && companiesEverLoaded && renderList.length === 0 && search.status !== 'failed' && search.error_type !== 'EmptyResult' && (
            <Notice
              tone="warning"
              title="Под фильтры не попала ни одна компания"
              action={
                tokens.length > 0 ? (
                  <Button size="sm" variant="secondary" onClick={resetAllFilters}>
                    Сбросить фильтры
                  </Button>
                ) : undefined
              }
            >
              Ослабьте условия — например, уберите минимум рейтинга или «Только с сайтом».
            </Notice>
          )}

          {renderList.length > 0 && viewMode === 'list' && (
            <ul className="flex flex-col gap-3.5">
              {renderList.map((c: any, idx: number) => {
                const cid = c.id ?? c.company_id;
                return (
                  <MapsCompanyCard
                    // fallback-ключ: у SSE-компании без сохранённого id его может не быть
                    key={cid ?? `pos-${idx}-${c.name ?? ''}`}
                    company={c}
                    onClick={cid != null ? () => setDrawerCompanyId(cid) : undefined}
                    onAddToList={cid != null ? onAddToList : undefined}
                    onDraftEmail={cid != null ? onDraftEmail : undefined}
                    draftEmailLoading={false}
                    aiAnalysis={cid != null ? (aiAnalyses.get(cid) ?? null) : null}
                    selected={typeof cid === 'number' && selectedIds.has(cid)}
                    onToggleSelect={typeof cid === 'number' ? toggleSelect : undefined}
                    activeSource={filter.source_filter ?? null}
                  />
                );
              })}
            </ul>
          )}

          {renderList.length > 0 && viewMode === 'map' && (
            <MapsCompaniesMap
              companies={renderList as CompanyOut[]}
              aiAnalyses={aiAnalyses}
              onOpenCompany={(cid) => setDrawerCompanyId(cid)}
              searchId={search.id}
              activeSource={filter.source_filter ?? 'all'}
            />
          )}

          {renderList.length > 0 && isTerminal && tokens.length > 0 && typeof search.companies_found === 'number' && shownTotal < search.companies_found && (
            <p className="pt-5 text-center text-small text-ui-text-muted">
              Под фильтры попали {shownTotal} из {search.companies_found} компаний ·{' '}
              <button type="button" onClick={resetAllFilters} className="font-semibold text-ui-accent hover:underline">
                показать всех
              </button>
            </p>
          )}

          {shownTotal > PAGE_SIZE && renderList.length > 0 && (
            <nav aria-label="Страницы выдачи" className="flex items-center justify-center gap-4 pt-5 text-small text-ui-text-muted">
              <Button variant="secondary" onClick={() => goToPage(page - 1)} disabled={page === 0 || isLoading}>
                ← Назад
              </Button>
              <span>
                <b className="font-semibold tabular-nums text-ui-text">
                  {rangeFrom}–{rangeTo}
                </b>{' '}
                из <b className="font-semibold tabular-nums text-ui-text">{shownTotal}</b>
              </span>
              <Button variant="secondary" onClick={() => goToPage(page + 1)} disabled={rangeTo >= shownTotal || isLoading}>
                Дальше →
              </Button>
            </nav>
          )}
        </section>
      </div>

      {/* === Плавающая панель действий с выбранными === */}
      {selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Действия с выбранными компаниями"
          className="fixed bottom-20 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-0.5 rounded-full bg-ui-text/95 py-1.5 pl-5 pr-1.5 text-ui-surface-2 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.4)] backdrop-blur-md md:bottom-6"
        >
          <span className="mr-1.5 whitespace-nowrap border-r border-white/15 pr-3.5 text-small font-semibold">
            Выбрано <span className="tabular-nums text-brand-300">{selectedIds.size}</span>
          </span>
          <BulkButton onClick={() => setBulkAddOpen(true)}>В список</BulkButton>
          <BulkButton onClick={handleBulkKp}>КП</BulkButton>
          <BulkButton onClick={() => void handleBulkLpr()} disabled={lprBulkBusy} title="Ищем руководителя на страницах сайтов выбранных компаний — ~2 минуты">
            {lprBulkBusy ? 'Ставлю…' : 'Найти ЛПР'}
          </BulkButton>
          <BulkButton onClick={handleExportSelected}>Экспорт</BulkButton>
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Снять выбор"
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <MapsCompanyDetailDrawer companyId={drawerCompanyId} searchId={search.id} onClose={() => setDrawerCompanyId(null)} />

      <AddToListModal
        open={addToListCompanyId != null}
        companyIds={addToListCompanyId != null ? [addToListCompanyId] : []}
        defaultListName={`${search.niche} — ${search.city}`}
        onClose={() => setAddToListCompanyId(null)}
      />

      {/* Массовое добавление: тот же AddToListModal, но с отмеченными компаниями. */}
      <AddToListModal
        open={bulkAddOpen}
        companyIds={Array.from(selectedIds)}
        defaultListName={`${search.niche} — ${search.city}`}
        onClose={() => setBulkAddOpen(false)}
        onDone={() => {
          // Снимаем выбор, чтобы тех же лидов случайно не отгрузили второй раз.
          setBulkAddOpen(false);
          clearSelection();
        }}
      />

      <KpModal
        open={kpCompanyId != null}
        companyId={kpCompanyId}
        companyName={kpCompanyName}
        onClose={() => {
          setKpCompanyId(null);
          setKpCompanyName(undefined);
        }}
      />
    </div>
  );
}

/* ===== Части страницы результатов ===== */

const PAGE_SIZE = 50;

const EMPTY_FILTER: MapSearchFilter = {
  min_rating: null,
  max_rating: null,
  min_reviews: null,
  min_negative: null,
  has_owner_replies: null,
  has_website: null,
  has_lpr: null,
  pain_tag_ids: null,
  review_text_contains: null,
  review_text_excludes: null,
  review_text_contains_any: null,
  review_text_excludes_any: null,
  min_revenue: null,
  min_age_years: null,
  opf_in: null,
  source_filter: 'all',
  hiring_marketing: null,
};

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'rating_desc', label: 'Рейтинг: лучшие сверху' },
  { value: 'rating_asc', label: 'Рейтинг: худшие сверху' },
  { value: 'negative_desc', label: 'Больше негатива' },
  { value: 'pain_desc', label: 'Больше упоминаний болей' },
  { value: 'reviews_desc', label: 'Больше отзывов' },
  { value: 'temperature_desc', label: 'Горячие лиды сверху' },
  { value: 'website_score_desc', label: 'Нужен сайт — сверху' },
];

const SOURCE_NAME: Record<string, string> = { '2gis': '2GIS', yandex_maps: 'Яндекс.Карты', google_maps: 'Google Maps', google: 'Google Maps' };

function sourceNames(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => SOURCE_NAME[s] ?? s)
    .join(' + ');
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Активные фильтры — токенами над выдачей; patch снимает фильтр. */
function filterTokens(f: MapSearchFilter, painTags: PainTagOut[]): { id: string; label: string; patch: Partial<MapSearchFilter> }[] {
  const out: { id: string; label: string; patch: Partial<MapSearchFilter> }[] = [];
  const yesNo = (v: boolean | null | undefined, yes: string, no: string) => (v === true ? yes : v === false ? no : null);
  if (f.min_rating != null && f.max_rating != null)
    out.push({ id: 'rating', label: `Рейтинг ${f.min_rating}–${f.max_rating}`, patch: { min_rating: null, max_rating: null } });
  else if (f.min_rating != null) out.push({ id: 'rating', label: `Рейтинг от ${f.min_rating}`, patch: { min_rating: null } });
  else if (f.max_rating != null) out.push({ id: 'rating', label: `Рейтинг до ${f.max_rating}`, patch: { max_rating: null } });
  if (f.min_reviews != null) out.push({ id: 'reviews', label: `Отзывов от ${f.min_reviews}`, patch: { min_reviews: null } });
  if (f.min_negative != null) out.push({ id: 'negative', label: `Негативных от ${f.min_negative}`, patch: { min_negative: null } });
  const replies = yesNo(f.has_owner_replies, 'Владелец отвечает', 'Владелец не отвечает');
  if (replies) out.push({ id: 'replies', label: replies, patch: { has_owner_replies: null } });
  const site = yesNo(f.has_website, 'Только с сайтом', 'Только без сайта');
  if (site) out.push({ id: 'site', label: site, patch: { has_website: null } });
  const lpr = yesNo(f.has_lpr, 'Есть ЛПР', 'Без ЛПР');
  if (lpr) out.push({ id: 'lpr', label: lpr, patch: { has_lpr: null } });
  const hiring = yesNo(f.hiring_marketing, 'Ищут маркетолога', 'Не ищут маркетолога');
  if (hiring) out.push({ id: 'hiring', label: hiring, patch: { hiring_marketing: null } });
  if (f.opf_in?.length)
    out.push({ id: 'opf', label: `Юр. лицо: ${f.opf_in.map((v) => (v === '__unknown__' ? 'нет данных' : v)).join(', ')}`, patch: { opf_in: null } });
  const contains = [f.review_text_contains, ...(f.review_text_contains_any ?? [])].filter(Boolean);
  if (contains.length)
    out.push({ id: 'contains', label: `В отзывах: «${contains.join('», «')}»`, patch: { review_text_contains: null, review_text_contains_any: null } });
  const excludes = [f.review_text_excludes, ...(f.review_text_excludes_any ?? [])].filter(Boolean);
  if (excludes.length)
    out.push({ id: 'excludes', label: `Без слов: «${excludes.join('», «')}»`, patch: { review_text_excludes: null, review_text_excludes_any: null } });
  for (const tagId of f.pain_tag_ids ?? []) {
    const tag = painTags.find((t) => t.id === tagId);
    const rest = (f.pain_tag_ids ?? []).filter((x) => x !== tagId);
    out.push({ id: `pain-${tagId}`, label: `Боль: «${tag?.label ?? `#${tagId}`}»`, patch: { pain_tag_ids: rest.length ? rest : null } });
  }
  if (f.source_filter && f.source_filter !== 'all')
    out.push({ id: 'source', label: `Только ${SOURCE_NAME[f.source_filter] ?? f.source_filter}`, patch: { source_filter: 'all' } });
  return out;
}

function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: 'warning' | 'danger';
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('mb-4 flex flex-wrap items-start gap-3 rounded-card px-4 py-3 text-small', tone === 'danger' ? 'bg-ui-danger/[.07]' : 'bg-ui-warning/[.08]')}
    >
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold', tone === 'danger' ? 'text-ui-danger' : 'text-ui-warning')}>{title}</p>
        <div className="mt-0.5 text-ui-text-muted">{children}</div>
      </div>
      {action}
    </div>
  );
}

function ExportItem({ title, hint, onClick, disabled }: { title: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="block w-full rounded-control px-3 py-2 text-left hover:bg-ui-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="block text-sm font-semibold text-ui-text">{title}</span>
      <span className="block text-xs text-ui-text-muted">{hint}</span>
    </button>
  );
}

function BulkButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className="whitespace-nowrap rounded-full px-3 py-2 text-small font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/**
 * Компактная сводка топ-болей региона. Pipedrive-style, нейтральный slate
 * фон, без декоративных эмодзи. Показывает первые 5 pain-тегов для
 * (niche, city) по occurrences_count — чтобы юзер сразу видел «о чём
 * чаще всего жалуются в этой нише в этом городе» ещё до раскрытия
 * списка компаний.
 */
function RegionPainSummary({
  tags,
  niche,
  city,
  activeIds,
  onToggle,
  onClear,
}: {
  tags: PainTagOut[];
  niche: string;
  city: string | null;
  /** Текущий фильтр pain_tag_ids — для подсветки активных плиток. */
  activeIds: number[];
  /** Клик по плитке: toggle id в фильтре списка компаний. */
  onToggle: (id: number) => void;
  /** Снять все pain-фильтры. */
  onClear: () => void;
}) {
  // Дедуп по нормализованному label — на проде встречаются почти-дубли
  // («Качество услуг», «Качество услуг и цены») из несовершенного
  // LLM-naming на ранних recluster-прогонах.
  const seen = new Set<string>();
  const unique = tags.filter((t) => {
    const key = (t.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key) || isUnnamedPainLabel(t.label)) return false;
    seen.add(key);
    return true;
  });
  // 2026-07-11: показываем до 8 плиток (было 6), плюс раскрывашка если
  // в нише больше 8 болей. Юзер хотел «больше выбора» + чёткое multi-select.
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? unique : unique.slice(0, 8);
  const hasActive = activeIds.length > 0;
  const activeCount = activeIds.length;
  if (visible.length === 0) return null;

  return (
    <div className="mt-2 flex overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div aria-hidden className="w-1 shrink-0 bg-rose-500" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span>
            Топ-боли ниши — можно выбирать несколько плиток
            {activeCount > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-xs normal-case text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                выбрано {activeCount}
              </span>
            )}
          </span>
          <span className="rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium normal-case tracking-normal text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {niche}
            {city ? ` · ${city}` : ''}
          </span>
          {hasActive && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto rounded border border-slate-300 px-1.5 py-0.5 text-xs font-medium normal-case tracking-normal text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              × снять {activeCount > 1 ? `все ${activeCount}` : 'фильтр'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visible.map((t) => {
            const active = activeIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onToggle(t.id)}
                title={
                  active
                    ? 'Клик ещё раз — снять фильтр по этой боли'
                    : (t.description ?? 'Показать только компании с этой болью')
                }
                className={
                  'group inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-1 dark:focus:ring-rose-700 dark:focus:ring-offset-slate-900 ' +
                  (active
                    ? 'border-rose-500 bg-rose-50 text-rose-900 ring-1 ring-rose-300 dark:border-rose-400 dark:bg-rose-900/30 dark:text-rose-100 dark:ring-rose-700'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-rose-400 hover:bg-rose-50/60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-rose-500 dark:hover:bg-rose-900/20')
                }
              >
                <Filter
                  className={
                    'h-3 w-3 shrink-0 transition-colors ' +
                    (active
                      ? 'text-rose-600 dark:text-rose-300'
                      : 'text-slate-500 group-hover:text-rose-500 dark:text-slate-500 dark:group-hover:text-rose-400')
                  }
                  aria-hidden
                />
                <span className="leading-tight">{t.label}</span>
                <span
                  className={
                    'rounded-sm px-1 text-xs tabular-nums ' +
                    (active
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-800/40 dark:text-rose-100'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300')
                  }
                >
                  {t.occurrences_count}
                </span>
              </button>
            );
          })}
          {unique.length > 8 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
              title={
                expanded ? 'Скрыть, оставить топ-8' : `Показать ещё ${unique.length - 8} плиток`
              }
            >
              {expanded ? '× свернуть' : `+ ещё ${unique.length - 8}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 2026-06-16: компактная полоса с переключателями «Источник / Период».
 * Вынесена из блока «ТОП-БОЛИ», чтобы оставаться видимой даже когда
 * для выбранного среза нет pain-тегов (раньше тогглы исчезали вместе
 * с блоком, и юзер не мог переключиться обратно).
 */
function PainHeaderControlsBar({
  sourceFilter,
  onSourceFilterChange,
  periodDays,
  onPeriodChange,
  sentiment,
  onSentimentChange,
}: {
  sourceFilter: '2gis' | 'yandex_maps' | 'google' | null;
  onSourceFilterChange: (next: '2gis' | 'yandex_maps' | 'google' | null) => void;
  periodDays: number | null;
  onPeriodChange: (next: number | null) => void;
  sentiment: 'negative' | 'positive';
  onSentimentChange: (next: 'negative' | 'positive') => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Тип:
      </span>
      <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
        {[
          { v: 'negative' as const, label: 'Боли' },
          { v: 'positive' as const, label: 'Сильные стороны' },
        ].map(({ v, label }) => {
          const active = sentiment === v;
          // 2026-06-19: семантический цвет тогглов всегда, не только в
          // active-состоянии. Юзер: «Боли» должны быть красноватые,
          // «Сильные стороны» — зелёные — чтобы по цвету было сразу
          // видно, какой срез сейчас доступен.
          const cls = active
            ? v === 'positive'
              ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-900'
              : 'bg-rose-600 text-white dark:bg-rose-500 dark:text-slate-900'
            : v === 'positive'
              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50'
              : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50';
          return (
            <button
              key={v}
              type="button"
              onClick={() => onSentimentChange(v)}
              className={
                'border-l px-2 py-0.5 font-medium first:border-l-0 ' +
                cls +
                ' border-slate-300 dark:border-slate-600'
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Источник:
      </span>
      <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
        {[
          { v: null, label: 'Все' },
          { v: '2gis' as const, label: '2GIS' },
          { v: 'yandex_maps' as const, label: 'Я.Карты' },
          { v: 'google' as const, label: 'Google' },
        ].map(({ v, label }) => {
          const active = sourceFilter === v;
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => onSourceFilterChange(v)}
              className={
                'border-l px-2 py-0.5 font-medium first:border-l-0 ' +
                (active
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700') +
                ' border-slate-300 dark:border-slate-600'
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Период:
      </span>
      <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
        {[
          { v: 30, label: '30д' },
          { v: 90, label: '90д' },
          { v: 365, label: 'год' },
          { v: null, label: 'всё' },
        ].map(({ v, label }) => {
          const active = periodDays === v;
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => onPeriodChange(v)}
              className={
                'border-l px-2 py-0.5 font-medium first:border-l-0 ' +
                (active
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700') +
                ' border-slate-300 dark:border-slate-600'
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Inline-блок с барчартом динамики отзывов (по источникам).
 * Два режима:
 *   - tag != null: динамика конкретной боли (по клику на pain-плитку).
 *   - tag == null: общая динамика всех отзывов в нише+городе (всегда видна
 *     в шапке выдачи по запросу юзера 2026-06-12).
 * Источник данных — /maps/insights/pain-trend или /maps/insights/reviews-trend.
 */
function RegionPainTrendInline({
  tag,
  trend,
  loading,
  onClose,
  headline,
}: {
  tag?: PainTagOut | null;
  trend: NichePainTrendOut | null;
  loading: boolean;
  onClose?: () => void;
  /** Подпись блока. По умолчанию «Динамика по месяцам». */
  headline?: string;
}) {
  const sourceColor: Record<string, string> = {
    '2gis': '#0ea5e9',
    yandex_maps: '#f43f5e',
    google: '#a855f7',
  };
  const sourceShortLabel: Record<string, string> = {
    '2gis': '2GIS',
    yandex_maps: 'Я.Карты',
    google: 'Google',
  };

  // Группировка по месяцу × источнику.
  const byMonth = new Map<string, Record<string, number>>();
  for (const p of trend?.points ?? []) {
    const row = byMonth.get(p.month) ?? {};
    row[p.source] = (row[p.source] ?? 0) + p.count;
    byMonth.set(p.month, row);
  }
  const months = Array.from(byMonth.keys()).sort();
  const allSources = Array.from(new Set((trend?.points ?? []).map((p) => p.source)));
  const maxCount = Math.max(1, ...(trend?.points ?? []).map((p) => p.count));

  const W = 720;
  const H = 100;
  const PAD = { top: 8, right: 8, bottom: 18, left: 22 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const groupWidth = months.length > 0 ? innerW / months.length : innerW;
  const barWidth = Math.max(2, Math.min(24, (groupWidth - 4) / Math.max(1, allSources.length)));

  return (
    <div className="mt-1.5 flex overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div aria-hidden className={cn('w-1 shrink-0', tag ? 'bg-rose-500' : 'bg-slate-400')} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-1.5">
        <div className="flex flex-wrap items-baseline gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {headline ?? 'Динамика по месяцам'}
          </span>
          {tag && (
            <span className="rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200">
              {tag.label}
            </span>
          )}
          {trend && (
            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
              {trend.total_reviews} отз. · {trend.companies_affected} комп.
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded border border-slate-300 px-1.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              × закрыть
            </button>
          )}
        </div>
        {loading && !trend ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Загружаем динамику…
          </div>
        ) : months.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Нет отзывов с датами в выбранном окне — попробуй расширить период.
          </div>
        ) : (
          <>
            <svg
              width="100%"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="block"
              role="img"
              aria-label={
                tag ? `Динамика «${tag.label}» по месяцам` : 'Динамика всех отзывов по месяцам'
              }
            >
              <line
                x1={PAD.left}
                y1={PAD.top + innerH}
                x2={PAD.left + innerW}
                y2={PAD.top + innerH}
                stroke="currentColor"
                className="text-slate-300 dark:text-slate-600"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 4}
                y={PAD.top + 4}
                textAnchor="end"
                fontSize={9}
                className="fill-slate-500 dark:fill-slate-400 tabular-nums"
              >
                {maxCount}
              </text>
              <text
                x={PAD.left - 4}
                y={PAD.top + innerH}
                textAnchor="end"
                fontSize={9}
                className="fill-slate-500 dark:fill-slate-400 tabular-nums"
              >
                0
              </text>
              {months.map((m, mi) => {
                const groupX = PAD.left + mi * groupWidth + 2;
                const monthRow = byMonth.get(m) ?? {};
                return (
                  <g key={m}>
                    {allSources.map((src, si) => {
                      const count = monthRow[src] ?? 0;
                      const h = (count / maxCount) * innerH;
                      const x = groupX + si * barWidth;
                      const y = PAD.top + innerH - h;
                      return (
                        <rect
                          key={src}
                          x={x}
                          y={y}
                          width={Math.max(1, barWidth - 1)}
                          height={Math.max(0, h)}
                          fill={sourceColor[src] ?? '#94a3b8'}
                          opacity={0.9}
                        >
                          <title>
                            {m} · {sourceShortLabel[src] ?? src} · {count}
                          </title>
                        </rect>
                      );
                    })}
                    {(mi === 0 ||
                      mi === months.length - 1 ||
                      mi % Math.ceil(months.length / 8) === 0) && (
                      <text
                        x={groupX + (allSources.length * barWidth) / 2}
                        y={PAD.top + innerH + 12}
                        textAnchor="middle"
                        fontSize={9}
                        className="fill-slate-500 dark:fill-slate-400 tabular-nums"
                      >
                        {m.slice(2)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
              {allSources.map((src) => (
                <span key={src} className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: sourceColor[src] ?? '#94a3b8' }}
                  />
                  {sourceShortLabel[src] ?? src}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Прогресс-плашка AI-разбора отзывов в нише.
 *
 * Три фазы (stage), показываем их человеческим языком + прогресс-бар:
 *   1. analyzing  — embeddings/sentiment отзывов (ProxyAPI/OpenAI)
 *   2. clustering — k-means + LLM-naming кластеров
 *   3. ready      — pain-теги начали появляться у компаний
 *
 * progress=null означает «только что нажали, ещё не дождались первого ответа».
 *
 * Детектор «зависло»: если эмбеддинги 100% и pain_tags_total=0 уже >3 мин —
 * почти наверняка recluster_pains_for_niche упал тихо или нашёл 0 кластеров.
 * Показываем CTA «Запустить заново».
 */
function AiPainProgressBar({
  progress,
  startedAt,
  diagnostic,
  diagnosticRunning,
  onDismiss,
  onRestart,
  onRunDiagnostic,
}: {
  progress: MapsAiProgressOut | null;
  startedAt: number | null;
  diagnostic: MapsReclusterDiagnosticOut | null;
  diagnosticRunning: boolean;
  onDismiss: () => void;
  onRestart: () => void;
  onRunDiagnostic: () => void;
}) {
  const stage = progress?.stage ?? 'analyzing';
  const rawPercent = progress?.percent ?? 5;
  // На stage='ready' бэк отдаёт companies_with_pains/total*100 — это «доля
  // охваченных компаний», а не «прогресс работы». UI показывал «Готово · 75%»,
  // что путало: «готово» подразумевает финал, а 75% — «недоделано».
  // Здесь нормализуем: при stage='ready' прогресс это 100% (работа сделана),
  // а соотношение N/M отображаем отдельной строкой ниже.
  const percent = stage === 'ready' ? 100 : rawPercent;
  const elapsedSec = startedAt != null ? Math.floor((Date.now() - startedAt) / 1000) : 0;

  // Stuck-детектор: эмбеддинги готовы, но pain-тегов так и не появилось > 3 мин.
  const isStuck =
    progress != null &&
    stage === 'clustering' &&
    progress.reviews_total > 0 &&
    progress.reviews_with_embedding === progress.reviews_total &&
    progress.pain_tags_total === 0 &&
    elapsedSec > 180;

  const stageLabel = (() => {
    if (isStuck) return 'Похоже, AI зависла на финальном шаге';
    switch (stage) {
      case 'idle':
        return 'Нет отзывов для разбора';
      case 'analyzing':
        return 'Шаг 1 из 2 · читаю отзывы и считаю эмбеддинги';
      case 'clustering':
        return progress && progress.pain_tags_total > 0
          ? 'Шаг 2 из 2 · привязываю кластеры к компаниям'
          : 'Шаг 2 из 2 · собираю кластеры болей';
      case 'ready': {
        // Когда recluster завершился, но pain-тегов хватило не на всех компаний —
        // объясняем явно, чтобы юзер не думал что прогресс «застрял».
        const total = progress?.companies_total ?? 0;
        const done = progress?.companies_with_pains ?? 0;
        if (total > 0 && done < total) {
          return `Готово · pain-теги есть у ${done} из ${total} компаний (у остальных мало негатива)`;
        }
        return 'Готово · pain-теги собраны для всех компаний';
      }
      default:
        return 'AI работает…';
    }
  })();
  // v5 Pipedrive-style status bar: solid border-left status indicator,
  // нейтральный slate-фон, чёткий status pill. Никаких violet-glassmorphism.
  const accent = isStuck
    ? 'rose'
    : stage === 'ready'
      ? 'emerald'
      : stage === 'idle'
        ? 'slate'
        : 'blue';
  const wrapCls = isStuck
    ? 'border-rose-300 bg-white dark:border-rose-700 dark:bg-slate-900'
    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
  const stageBarColor =
    accent === 'rose'
      ? 'bg-rose-500'
      : accent === 'emerald'
        ? 'bg-emerald-500'
        : accent === 'slate'
          ? 'bg-slate-400'
          : 'bg-blue-500';
  const stagePillCls =
    accent === 'rose'
      ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200'
      : accent === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200'
        : accent === 'slate'
          ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
          : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-200';
  const stagePillText =
    accent === 'rose'
      ? 'Завис'
      : accent === 'emerald'
        ? 'Готово'
        : accent === 'slate'
          ? 'Простой'
          : 'В работе';

  return (
    <div className={`mt-2 flex overflow-hidden rounded border text-xs ${wrapCls}`}>
      <div aria-hidden className={`w-1 shrink-0 ${stageBarColor}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            AI-разбор отзывов
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${stagePillCls}`}
          >
            {stagePillText}
          </span>
          <span className="text-slate-600 dark:text-slate-300">{stageLabel}</span>
          <span className="ml-auto tabular-nums text-xs font-semibold text-slate-700 dark:text-slate-200">
            {percent}%
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full ${stageBarColor} transition-[width] duration-700`}
            style={{ width: `${Math.max(3, Math.min(100, percent))}%` }}
          />
        </div>
        {progress && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span title="Сколько компаний поиска уже получили pain-теги">
              <span className="text-slate-500 dark:text-slate-500">Готовы:</span>{' '}
              <b className="tabular-nums text-slate-900 dark:text-slate-100">
                {progress.companies_with_pains}
              </b>
              <span className="mx-1 text-slate-500">/</span>
              <b className="tabular-nums text-slate-700 dark:text-slate-300">
                {progress.companies_total}
              </b>{' '}
              компаний
            </span>
            {progress.reviews_total > 0 && (
              <span title="Сколько отзывов уже прошло через AI-эмбеддинги">
                <span className="text-slate-500 dark:text-slate-500">Отзывы:</span>{' '}
                <b className="tabular-nums text-slate-900 dark:text-slate-100">
                  {progress.reviews_with_embedding}
                </b>
                <span className="mx-1 text-slate-500">/</span>
                <b className="tabular-nums text-slate-700 dark:text-slate-300">
                  {progress.reviews_total}
                </b>
              </span>
            )}
            <span title="Сколько кластеров болей создано для этой ниши">
              <span className="text-slate-500 dark:text-slate-500">Кластеры:</span>{' '}
              <b className="tabular-nums text-slate-900 dark:text-slate-100">
                {progress.pain_tags_total}
              </b>
            </span>
            {startedAt && stage !== 'ready' && (
              <span title="Прошло времени с момента запуска AI-разбора" className="tabular-nums">
                {Math.floor(elapsedSec / 60)}:{(elapsedSec % 60).toString().padStart(2, '0')}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-2">
              {isStuck && (
                <button
                  type="button"
                  onClick={onRestart}
                  className="rounded bg-rose-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-rose-700"
                  title="Поставить AI-разбор в очередь повторно"
                >
                  Запустить заново
                </button>
              )}
              <button
                type="button"
                onClick={onDismiss}
                className="text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
                title="Скрыть прогресс-плашку. Запустить AI снова можно кнопкой выше."
              >
                скрыть
              </button>
            </span>
          </div>
        )}
        {isStuck && (
          <div className="space-y-1.5 border-t border-rose-200 pt-2 text-xs text-rose-800 dark:border-rose-800/60 dark:text-rose-200">
            <div>
              Эмбеддинги все готовы, но AI не создал ни одного кластера болей за 3+ минуты. Скорее
              всего celery-задача зависла или кластеризация даёт 0 кластеров.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={diagnosticRunning}
                onClick={onRunDiagnostic}
                className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-slate-800"
                title="Запустит синхронный recluster прямо сейчас и покажет точную причину (займёт до 1-2 минут)"
              >
                {diagnosticRunning
                  ? 'Диагностика выполняется… (до 2 мин)'
                  : 'Запустить диагностику'}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Синхронно прогонит кластеризацию и покажет точную причину
              </span>
            </div>
            {diagnostic && (
              <div className="rounded border border-rose-200 bg-white px-2.5 py-1.5 text-xs dark:border-rose-700 dark:bg-slate-900">
                <div className="font-semibold text-rose-900 dark:text-rose-100">
                  Результат диагностики:
                </div>
                <ul className="mt-1 space-y-0.5 text-slate-700 dark:text-slate-200">
                  <li>
                    Отзывов с эмбеддингами:{' '}
                    <b className="tabular-nums">{diagnostic.reviews_with_embedding}</b>
                  </li>
                  <li>
                    Кластеров после HDBSCAN/k-means:{' '}
                    <b className="tabular-nums">{diagnostic.clusters_found}</b>
                  </li>
                  <li>
                    Pain-тегов upserted:{' '}
                    <b className="tabular-nums">{diagnostic.pain_tags_upserted}</b>
                  </li>
                  <li>
                    Компаний получили теги:{' '}
                    <b className="tabular-nums">{diagnostic.companies_with_pains_after}</b> из{' '}
                    {diagnostic.companies_total}
                  </li>
                  {diagnostic.error && (
                    <li className="font-medium text-rose-800 dark:text-rose-200">
                      Ошибка: {diagnostic.error}
                    </li>
                  )}
                </ul>
                {diagnostic.companies_with_pains_after > 0 && (
                  <div className="mt-1 text-emerald-700 dark:text-emerald-300">
                    Готово! Закрой плашку — плитки появились в карточках.
                  </div>
                )}
                {!diagnostic.error && diagnostic.companies_with_pains_after === 0 && (
                  <div className="mt-1 text-rose-800 dark:text-rose-200">
                    {diagnostic.reviews_with_embedding === 0
                      ? 'Не было отзывов с эмбеддингами — analyze не отрабатывал. Проверь ProxyAPI токены.'
                      : diagnostic.clusters_found === 0
                        ? 'Кластеризация дала 0 кластеров. Слишком разнородные/мало отзывов либо HDBSCAN + k-means оба сломались.'
                        : 'Кластеры есть, но match не присвоил их компаниям. Скорее всего слишком высокий REVIEWS_AI_PAIN_MATCH_THRESHOLD.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {stage === 'idle' && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            У компаний этой выдачи пока нет отзывов — разбирать нечего. Попробуй другую нишу или
            подожди, пока подтянутся отзывы.
          </div>
        )}
      </div>
    </div>
  );
}
