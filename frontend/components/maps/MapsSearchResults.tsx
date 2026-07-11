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
import { Brain, Filter, List, Map as MapIcon, Sliders, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { ButtonV2 } from '@/components/ui/ButtonV2';
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

const SOURCE_PRETTY: Record<string, { label: string; dot: string }> = {
  '2gis': { label: '2GIS', dot: '🟢' },
  'yandex_maps': { label: 'Я.Карты', dot: '🔴' },
  'google_maps': { label: 'Google Maps', dot: '🔵' },
};

function sourceListPretty(
  raw: string | null | undefined,
): Array<{ id: string; label: string; dot: string }> {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => ({
      id,
      label: SOURCE_PRETTY[id]?.label ?? id,
      dot: SOURCE_PRETTY[id]?.dot ?? '·',
    }));
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
    queued: number; cached: number; over_limit: number; limit_remaining: number;
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
  const [reclusterState, setReclusterState] = useState<
    'idle' | 'queueing' | 'queued' | 'error'
  >('idle');
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
  // Был ли filter тронут юзером в боковой панели после загрузки страницы.
  // Используется чтобы скрыть зелёный баннер «Применён пресет с формы поиска»
  // как только юзер начал крутить фильтры (иначе баннер «застрял» и врал).
  const [filterDirty, setFilterDirty] = useState(false);

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
    setFilterDirty(true);
  }, []);

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

  const onDraftEmail = useCallback((c: any) => {
    const id = c.id ?? c.company_id;
    if (id == null) return;
    setKpCompanyId(id);
    setKpCompanyName(c.name ?? undefined);
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
  const baseList: any[] = companiesEverLoaded ? companies : liveCompanies;
  const renderTotal = baseList.length;

  // 2026-06-12: выбранные id (Set<number>) дрейфовали относительно реально
  // видимых карточек — юзер снимал pain-фильтр, компания вылетала из
  // выдачи, а «Выбрано: 1» в шапке оставалось (плюс рамка-обводка на
  // подтянувшейся карточке с другим id). Чистим selectedIds, оставляя
  // только те, что реально присутствуют в baseList.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visibleIds = new Set<number>();
    for (const c of baseList) {
      const id = (c as any).id ?? (c as any).company_id;
      if (typeof id === 'number') visibleIds.add(id);
    }
    let changed = false;
    const next = new Set<number>();
    for (const id of selectedIds) {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [baseList, selectedIds]);

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
  }, [reclusterState, search.id, refreshCompanies, filter, fetchAiProgressOnce, stopAiProgressPolling]);

  useEffect(() => stopAiProgressPolling, [stopAiProgressPolling]);

  // Подтягиваем pain-теги (niche, city) для шапки «ТОП-боли региона».
  // Источник — /maps/pain-tags (niche+city с опциональным source/from/to —
  // пересчёт occurrences по подмножеству отзывов). Перезапрашиваем при
  // изменении aiProgress.pain_tags_total — после recluster обновляется без
  // ручного refresh. Также при смене source/period.
  useEffect(() => {
    let mounted = true;
    if (!search?.niche) return;
    const from = painPeriodDays != null
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
    const from = painPeriodDays != null
      ? new Date(Date.now() - painPeriodDays * 86_400_000).toISOString().slice(0, 10)
      : undefined;
    getNicheReviewsTrend(
      search.niche,
      search.city ?? null,
      painSourceFilter ?? undefined,
      from,
    )
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
    const from = painPeriodDays != null
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
  }, [
    painTagForChart,
    search?.niche,
    search?.city,
    painSourceFilter,
    painPeriodDays,
  ]);

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] sm:text-[22px] font-semibold leading-tight tracking-tight text-[hsl(var(--text))]">
              {search.niche}
              <span className="text-[hsl(var(--muted))]"> · </span>
              {search.mode === 'radius' && search.address
                ? `${search.address} · радиус ${((search.radius_meters ?? 0) / 1000).toFixed(1)} км`
                : search.city}
            </h2>
            {/* Чипы статуса вместо одной плотной строки текста. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
              <span
                className="inline-flex items-center gap-1 rounded-pill bg-[hsl(var(--surface-2))] px-2 py-0.5 font-medium text-[hsl(var(--text))]"
                title="Сколько компаний показано в выдаче"
              >
                <span className="text-[11px] text-[hsl(var(--muted))]">
                  {isTerminal
                    ? companiesEverLoaded &&
                      typeof search.companies_found === 'number' &&
                      renderTotal !== search.companies_found
                      ? 'Под фильтр'
                      : 'Найдено'
                    : 'Уже найдено'}
                </span>
                <span className="font-semibold tabular-nums">
                  {isTerminal
                    ? companiesEverLoaded &&
                      typeof search.companies_found === 'number' &&
                      renderTotal !== search.companies_found
                      ? `${renderTotal} из ${search.companies_found}`
                      : (search.companies_found ?? renderTotal)
                    : renderTotal}
                </span>
                <span className="text-[11px] text-[hsl(var(--muted))]">
                  {(() => {
                    const n = isTerminal ? renderTotal : renderTotal;
                    if (n === 1) return 'компания';
                    if (n >= 2 && n <= 4) return 'компании';
                    return 'компаний';
                  })()}
                </span>
              </span>
              {/* Источники как мини-бейджи. */}
              {sourceListPretty(search.sources).map((src) => (
                <span
                  key={src.id}
                  className="inline-flex items-center gap-1 rounded-pill border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--text))]"
                  title={`Источник данных: ${src.label}`}
                >
                  <span aria-hidden>{src.dot}</span> {src.label}
                </span>
              ))}
              {/* Статус только если он информативен (не completed) или показываем "из кэша" с иконкой. */}
              {search.status === 'from_cache' && (
                <span
                  className="inline-flex items-center gap-1 rounded-pill bg-[var(--signal-cool-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--signal-cool)] ring-1 ring-inset ring-[color:var(--signal-cool)]/30"
                  title="Результат не парсился заново — взят из ранее собранной выдачи"
                >
                  ⚡ из кэша
                </span>
              )}
              {!isTerminal && (
                <span
                  className="inline-flex items-center gap-1 rounded-pill bg-[var(--signal-warm-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--signal-warm)] ring-1 ring-inset ring-[color:var(--signal-warm)]/30"
                  title="Парсер ещё собирает компании"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--signal-warm)] animate-pulse" />
                  {statusLabel(search.status)}
                </span>
              )}
              {search.status === 'failed' && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-[var(--signal-hot-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--signal-hot)] ring-1 ring-inset ring-[color:var(--signal-hot)]/30">
                  ⚠ ошибка
                </span>
              )}
            </div>
            {search.filters && Object.keys(search.filters).length > 0 && !filterDirty && (
              <div className="mt-1 inline-block rounded-v2-sm border border-[color:var(--signal-good)]/30 bg-[var(--signal-good-bg)] px-2 py-0.5 text-[11px] text-[color:var(--signal-good)]">
                Применён пресет с формы поиска — фильтры выставлены в панели слева
              </div>
            )}
            {/* Live прогресс-плашка AI-разбора. Появляется после клика
                «Разобрать боли AI» и тикает каждые 5 сек. Раньше юзер видел
                только кнопку «AI работает — ~4 мин» и не знал, идёт ли вообще
                что-то — теперь видны три фазы и реальные числа отзывов. */}
            {reclusterState === 'queued' && (
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
                    if (r.companies_with_pains_after > 0) {
                      void refreshCompanies(filter);
                    }
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
                      error:
                        typeof detail === 'string'
                          ? detail
                          : 'Не удалось выполнить diagnostic (timeout/500)',
                    });
                  } finally {
                    setDiagnosticRunning(false);
                  }
                }}
              />
            )}
            {/* 2026-06-16: переключатели Источник/Период вынесены отдельной
                компактной полосой над блоком ТОП-БОЛИ. Сам блок плиток рендерится
                ниже только при наличии тегов — без пустого empty-state'а, чтобы
                не создавать визуальный пробел. Клик по источнику меняет и
                pain-tags, и фильтр выдачи компаний (см. handlePainSourceChange).
                Toggle «Боли / Сильные стороны» — рядом, меняет sentiment в
                запросах /maps/pain-tags и /maps/insights/demand-index. */}
            <PainHeaderControlsBar
              sourceFilter={painSourceFilter}
              onSourceFilterChange={handlePainSourceChange}
              periodDays={painPeriodDays}
              onPeriodChange={setPainPeriodDays}
              sentiment={painSentiment}
              onSentimentChange={setPainSentiment}
            />
            {/* 2026-06-17: empty-state для positive-sentiment. До запуска
                позитивного recluster (отдельная задача) тегов в БД нет —
                блок ТОП-БОЛИ и «Сравнение с нишей» просто исчезают.
                Показываем дружелюбное объяснение вместо пустоты. */}
            {painSentiment === 'positive' && regionPainTags.length === 0 && (
              <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-[12.5px] text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                <div className="font-semibold">
                  Анализ сильных сторон ниши скоро будет
                </div>
                <div className="mt-1 text-emerald-800/90 dark:text-emerald-200/80">
                  AI кластеризует позитивные отзывы отдельно от негативных.
                  Если кнопка ниже неактивна — кластер ещё не запущен; нажми
                  «Запустить», и через 2-4 минуты появятся «сильные стороны»
                  ниши: за что клиенты хвалят компании в этом городе.
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      positiveReclusterState === 'queueing' ||
                      positiveReclusterState === 'queued'
                    }
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
                        setPositiveReclusterMsg(
                          e?.response?.data?.detail ||
                            e?.message ||
                            'Не удалось поставить задачу.',
                        );
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {positiveReclusterState === 'queueing'
                      ? 'Ставлю в очередь…'
                      : positiveReclusterState === 'queued'
                        ? `Жду плитки · попытка ${positivePollAttempt + 1}/12`
                        : positiveReclusterState === 'done'
                          ? 'Готово ✓'
                          : positiveReclusterState === 'timeout'
                            ? 'Запустить ещё раз'
                            : 'Запустить кластеризацию сильных сторон'}
                  </button>
                  {positiveReclusterMsg && (
                    <span
                      className={
                        'text-[11px] ' +
                        (positiveReclusterState === 'error'
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-emerald-800/80 dark:text-emerald-200/70')
                      }
                    >
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
                onToggle={(id) => {
                  const current = filter.pain_tag_ids ?? [];
                  const next = current.includes(id)
                    ? current.filter((x) => x !== id)
                    : [...current, id];
                  setFilter((prev) => ({
                    ...prev,
                    pain_tag_ids: next.length > 0 ? next : null,
                  }));
                  setFilterDirty(true);
                  // Открываем/закрываем inline chart на том же кликe.
                  const tag = regionPainTags.find((t) => t.id === id) ?? null;
                  setPainTagForChart((prev) => (prev?.id === id ? null : tag));
                }}
                onClear={() => {
                  setFilter((prev) => ({ ...prev, pain_tag_ids: null }));
                  setFilterDirty(true);
                  setPainTagForChart(null);
                }}
              />
            )}
            {/* 2026-06-21: один график вместо двух — переключается между
                общей динамикой ниши и динамикой по выбранной боли. До
                этого «Динамика отзывов в нише» и «Динамика по месяцам»
                висели одна под другой и дублировали друг друга по форме.
                Сейчас: пока боль не выбрана — общая; кликнул на pain-
                плитку выше — тот же график переключается на её серию,
                рядом с заголовком появляется pain-пилл и «× закрыть». */}
            <RegionPainTrendInline
              tag={painTagForChart}
              trend={painTagForChart ? painTrend : reviewsTrend}
              loading={painTagForChart ? painTrendLoading : reviewsTrendLoading}
              headline="Динамика отзывов в нише"
              onClose={
                painTagForChart ? () => setPainTagForChart(null) : undefined
              }
            />

            {/* Сравнение с нишей — как в drawer, но без привязки к компании.
                Показывает топ болей с долей компаний и средним на компанию.
                Кликабельные строки — фильтрует список по pain_tag_id. */}
            <NicheBenchmarkOverviewBlock
              niche={search.niche}
              city={search.city}
              activePainTagIds={filter.pain_tag_ids ?? []}
              sentiment={painSentiment}
              onPainClick={(id) => {
                const current = filter.pain_tag_ids ?? [];
                const next = current.includes(id)
                  ? current.filter((x) => x !== id)
                  : [...current, id];
                setFilter((prev) => ({
                  ...prev,
                  pain_tag_ids: next.length > 0 ? next : null,
                }));
                setFilterDirty(true);
              }}
            />
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
            {!isTerminal && (() => {
              // 2026-06-18: крупный прогресс-индикатор парсинга. Раньше
              // была декоративная 1.5px полоска с animate-pulse — юзер
              // не понимал, парсер начал или 80% уже. Теперь:
              //   - реальный процент из stream.progress (saved/expected
              //     либо processed/total, оба варианта прилетают с бэка)
              //   - крупная (h-2.5) полоса на всю ширину блока
              //   - текст «Парсинг: 192 из ~250 · 2GIS» (источник из event)
              const p = stream.progress;
              const saved = p?.saved ?? p?.companies_processed ?? p?.processed;
              const expected = p?.expected ?? p?.companies_total ?? p?.total;
              // Fallback: пока бэк не прислал прогресса — берём кол-во
              // компаний из стрима (companies.length растёт по мере
              // прихода event=company).
              const fallbackSaved =
                typeof saved === 'number' && saved > 0
                  ? saved
                  : stream.companies.length;
              const pct =
                typeof expected === 'number' && expected > 0
                  ? Math.min(100, Math.round((fallbackSaved / expected) * 100))
                  : null;
              return (
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      Парсер собирает компании
                      {p?.source && (
                        <span className="ml-1 text-slate-500 dark:text-slate-400">
                          · {p.source}
                        </span>
                      )}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {pct != null ? (
                        <>
                          {fallbackSaved} из ~{expected} ·{' '}
                          <span className="font-semibold">{pct}%</span>
                        </>
                      ) : fallbackSaved > 0 ? (
                        <>Уже найдено {fallbackSaved}</>
                      ) : (
                        // 2026-06-18: первые секунды парсинга — companies=0
                        // и progress ещё не пришёл. Раньше юзер видел «Уже
                        // найдено 0» и считал что парсер сломан. Теперь
                        // явная подсказка что идёт инициализация.
                        <>Запускаю парсер, ждём первых ответов источника…</>
                      )}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    {pct != null ? (
                      <div
                        className="h-full bg-brand-gradient transition-all duration-500"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    ) : (
                      <div className="h-full w-1/3 animate-pulse bg-brand-gradient" />
                    )}
                  </div>
                  {stream.reconnectAttempt > 0 && !stream.error && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400">
                      Связь временно прервана, переподключаюсь… (попытка{' '}
                      {stream.reconnectAttempt}). Парсер продолжает работу в фоне.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          {/* Toolbar шапки. При пустой выдаче (нет multi-source segment,
              view-toggle, export-меню, recluster-кнопки) внутри остаётся
              только «Новый поиск» — без ml-auto она липнет к заголовку,
              без огромного gap'а до правого края. При наличии выдачи
              lg:ml-auto работает как старый justify-between. */}
          <div
            className={cn(
              'flex flex-wrap items-center gap-2',
              !(isTerminal && renderTotal === 0) && 'lg:ml-auto',
            )}
          >
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
                кнопка не нужна. В состоянии queued вместо неинформативной
                кнопки рисуем мини-плашку с прогресс-баром — она ниже. */}
            {isTerminal &&
              companies.length > 0 &&
              companies.some((c) => !c.top_pains || c.top_pains.length === 0) &&
              reclusterState !== 'queued' && (
                <button
                  type="button"
                  onClick={() => void handleReclusterNiche()}
                  disabled={reclusterState === 'queueing'}
                  title={
                    reclusterMsg ||
                    'AI разберёт отзывы и присвоит pain-теги. Занимает 3-5 минут.'
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-600 dark:bg-violet-900/40 dark:text-violet-100 dark:hover:bg-violet-900/70"
                >
                  <Brain className="h-4 w-4" />
                  {reclusterState === 'queueing'
                    ? 'Ставлю в очередь…'
                    : reclusterState === 'error'
                      ? '⚠ Не удалось — повторить'
                      : 'Разобрать боли AI'}
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
          <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-3 py-2 text-sm text-[color:var(--signal-warm)]">
            <div className="font-medium">Live-обновление приостановлено</div>
            <div className="mt-0.5 text-[12px] opacity-90">
              Сервер закрыл long-poll после 3 попыток переподключения.
              Парсер продолжает работу в фоне — нажми «Обновить страницу»
              когда статус станет «готово» в шапке, либо подожди ~2 минуты
              и обнови сам.
            </div>
          </div>
        )}

        {search.status === 'failed' && isSoftEmptyError(search.error) && (
          <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-4 py-3 text-sm text-[color:var(--signal-warm)]">
            <div className="font-medium">Ничего не нашлось</div>
            <div className="mt-1 opacity-90">
              По этому запросу 2GIS ничего не вернул. Попробуй переформулировать нишу
              или сменить город.
            </div>
            <div className="mt-2">
              <button
                type="button"
                onClick={onNewSearch}
                className="inline-flex items-center gap-1 rounded-md bg-[color:var(--signal-warm)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Новый поиск
              </button>
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
              {reviewsTrend && reviewsTrend.companies_affected > 0 && (() => {
                const n = reviewsTrend.companies_affected;
                const mod10 = n % 10;
                const mod100 = n % 100;
                const word =
                  mod100 >= 11 && mod100 <= 14
                    ? 'компаний'
                    : mod10 === 1
                      ? 'компания'
                      : mod10 >= 2 && mod10 <= 4
                        ? 'компании'
                        : 'компаний';
                return (
                  <div className="mt-2 text-[12px] opacity-80">
                    В БД уже собрано {n} {word} этой ниши от прошлых поисков —
                    блоки «Динамика отзывов» и «Сравнение с нишей» ниже
                    считаются по ним.
                  </div>
                );
              })()}
              <button
                type="button"
                onClick={onNewSearch}
                className="mt-3 inline-flex items-center rounded-md bg-[color:var(--signal-warm)] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
              >
                Новый поиск
              </button>
            </div>
          )}

        {isLoading && renderList.length === 0 && search.status !== 'failed' && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            {isTerminal
              ? 'Загружаем компании по выбранным фильтрам…'
              : 'Парсер ищет компании. Карточки появятся по мере готовности.'}
          </div>
        )}

        {!isLoading &&
          companiesEverLoaded &&
          renderList.length === 0 &&
          search.status !== 'failed' &&
          search.error_type !== 'EmptyResult' && (
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
                    onClick={() => {
                      // Snapshot id'ов кладём в localStorage под одноразовым
                      // ref-ключом — sessionStorage у новой вкладки свой,
                      // а URL-параметр может не вместить 500 id'ов.
                      const ref = storeBulkKpPending(Array.from(selectedIds));
                      window.open(
                        `/app/leads/kp-jobs/new?ref=${ref}`,
                        '_blank',
                        'noopener',
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 font-medium text-violet-700 hover:border-violet-400 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/40"
                    title="Откроется новая вкладка: выбор шаблона/тона → старт. Партия попадёт в Историю → КП → Партии."
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Сформировать КП
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
                        // 2026-06-12: формулировки переписаны под живой
                        // язык юзера — «N карточек получат ЛПР через ~2 мин»,
                        // вместо технического «N в очереди».
                        const parts: string[] = [];
                        if (r.queued > 0) {
                          parts.push(
                            `Ищу директора на ${r.queued} сайт${r.queued === 1 ? 'е' : 'ах'} — пиллы «ЛПР есть» обновятся через ~2 мин`,
                          );
                        }
                        if (r.skipped_already_has_lpr > 0) {
                          parts.push(`${r.skipped_already_has_lpr} уже с ЛПР`);
                        }
                        if (r.skipped_no_website > 0) {
                          parts.push(`${r.skipped_no_website} без сайта (искать негде)`);
                        }
                        setLprBulkMsg(parts.join(' · ') || 'У всех выбранных компаний ЛПР уже найден.');
                        // Через ~2 минуты ЛПР должны появиться в БД — перезагружаем список.
                        setTimeout(() => void refreshCompanies(filter), 90_000);
                      } catch (e: any) {
                        setLprBulkMsg(e?.message ?? 'Ошибка при запуске обогащения ЛПР');
                      } finally {
                        setLprBulkBusy(false);
                      }
                    }}
                    title="Запустить фоновый парсер сайтов выбранных компаний — ищем страницы /team /о-нас /контакты и тянем оттуда ФИО директора. Через ~2 минуты карточки получают зелёный пилл «ЛПР есть»."
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {lprBulkBusy ? 'Ставлю в очередь…' : 'Найти ЛПР на сайтах'}
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
                    draftEmailLoading={false}
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
        searchId={search.id}
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
    if (!key || seen.has(key)) return false;
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
        <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span>
            Топ-боли ниши — можно выбирать несколько плиток
            {activeCount > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9.5px] normal-case text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                выбрано {activeCount}
              </span>
            )}
          </span>
          <span className="rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {niche}{city ? ` · ${city}` : ''}
          </span>
          {hasActive && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto rounded border border-slate-300 px-1.5 py-0.5 text-[10.5px] font-medium normal-case tracking-normal text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
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
                    : t.description ?? 'Показать только компании с этой болью'
                }
                className={
                  'group inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-[11.5px] font-medium shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-1 dark:focus:ring-rose-700 dark:focus:ring-offset-slate-900 ' +
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
                      : 'text-slate-400 group-hover:text-rose-500 dark:text-slate-500 dark:group-hover:text-rose-400')
                  }
                  aria-hidden
                />
                <span className="leading-tight">{t.label}</span>
                <span
                  className={
                    'rounded-sm px-1 text-[10px] tabular-nums ' +
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
              className="inline-flex items-center rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
              title={expanded ? 'Скрыть, оставить топ-8' : `Показать ещё ${unique.length - 8} плиток`}
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
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-900">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Тип:
      </span>
      <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
        {([
          { v: 'negative' as const, label: 'Боли' },
          { v: 'positive' as const, label: 'Сильные стороны' },
        ]).map(({ v, label }) => {
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
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Источник:
      </span>
      <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
        {([
          { v: null, label: 'Все' },
          { v: '2gis' as const, label: '2GIS' },
          { v: 'yandex_maps' as const, label: 'Я.Карты' },
          { v: 'google' as const, label: 'Google' },
        ]).map(({ v, label }) => {
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
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Период:
      </span>
      <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
        {([
          { v: 30, label: '30д' },
          { v: 90, label: '90д' },
          { v: 365, label: 'год' },
          { v: null, label: 'всё' },
        ]).map(({ v, label }) => {
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
    'yandex_maps': '#f43f5e',
    'google': '#a855f7',
  };
  const sourceShortLabel: Record<string, string> = {
    '2gis': '2GIS',
    'yandex_maps': 'Я.Карты',
    'google': 'Google',
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
  const barWidth = Math.max(
    2,
    Math.min(24, (groupWidth - 4) / Math.max(1, allSources.length)),
  );

  return (
    <div className="mt-1.5 flex overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div aria-hidden className={cn('w-1 shrink-0', tag ? 'bg-rose-500' : 'bg-slate-400')} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-1.5">
        <div className="flex flex-wrap items-baseline gap-2 text-[10.5px]">
          <span className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {headline ?? 'Динамика по месяцам'}
          </span>
          {tag && (
            <span className="rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200">
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
              className="ml-auto rounded border border-slate-300 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              × закрыть
            </button>
          )}
        </div>
        {loading && !trend ? (
          <div className="text-[11.5px] text-slate-500 dark:text-slate-400">Загружаем динамику…</div>
        ) : months.length === 0 ? (
          <div className="text-[11.5px] text-slate-500 dark:text-slate-400">
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
              aria-label={tag ? `Динамика «${tag.label}» по месяцам` : 'Динамика всех отзывов по месяцам'}
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
                    {(mi === 0 || mi === months.length - 1 || mi % Math.ceil(months.length / 8) === 0) && (
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-600 dark:text-slate-300">
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
  const elapsedSec =
    startedAt != null ? Math.floor((Date.now() - startedAt) / 1000) : 0;

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
    <div
      className={`mt-2 flex overflow-hidden rounded border text-[12px] ${wrapCls}`}
    >
      <div aria-hidden className={`w-1 shrink-0 ${stageBarColor}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            AI-разбор отзывов
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${stagePillCls}`}
          >
            {stagePillText}
          </span>
          <span className="text-slate-600 dark:text-slate-300">{stageLabel}</span>
          <span className="ml-auto tabular-nums text-[12px] font-semibold text-slate-700 dark:text-slate-200">
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-600 dark:text-slate-400">
            <span title="Сколько компаний поиска уже получили pain-теги">
              <span className="text-slate-500 dark:text-slate-500">Готовы:</span>{' '}
              <b className="tabular-nums text-slate-900 dark:text-slate-100">
                {progress.companies_with_pains}
              </b>
              <span className="mx-1 text-slate-400">/</span>
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
                <span className="mx-1 text-slate-400">/</span>
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
              <span
                title="Прошло времени с момента запуска AI-разбора"
                className="tabular-nums"
              >
                {Math.floor(elapsedSec / 60)}:
                {(elapsedSec % 60).toString().padStart(2, '0')}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-2">
              {isStuck && (
                <button
                  type="button"
                  onClick={onRestart}
                  className="rounded bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-rose-700"
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
          <div className="space-y-1.5 border-t border-rose-200 pt-2 text-[11.5px] text-rose-800 dark:border-rose-800/60 dark:text-rose-200">
            <div>
              Эмбеддинги все готовы, но AI не создал ни одного кластера болей за 3+ минуты.
              Скорее всего celery-задача зависла или кластеризация даёт 0 кластеров.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={diagnosticRunning}
                onClick={onRunDiagnostic}
                className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-2 py-1 text-[11.5px] font-medium text-rose-800 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-slate-800"
                title="Запустит синхронный recluster прямо сейчас и покажет точную причину (займёт до 1-2 минут)"
              >
                {diagnosticRunning
                  ? 'Диагностика выполняется… (до 2 мин)'
                  : 'Запустить диагностику'}
              </button>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Синхронно прогонит кластеризацию и покажет точную причину
              </span>
            </div>
            {diagnostic && (
              <div className="rounded border border-rose-200 bg-white px-2.5 py-1.5 text-[11.5px] dark:border-rose-700 dark:bg-slate-900">
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
                    <b className="tabular-nums">{diagnostic.companies_with_pains_after}</b>{' '}
                    из {diagnostic.companies_total}
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
          <div className="text-[11.5px] text-slate-500 dark:text-slate-400">
            У компаний этой выдачи пока нет отзывов — разбирать нечего. Попробуй другую нишу
            или подожди, пока подтянутся отзывы.
          </div>
        )}
      </div>
    </div>
  );
}
