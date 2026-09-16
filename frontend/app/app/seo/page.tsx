'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { createSearch, listSearches, getSearch, getSearchResults } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import { getOutreachTemplates } from '@/src/services/api/outreachTemplates';
import type { OutreachTemplate } from '@/src/services/api/outreachTemplates';
import {
  getSeoAdvancedSettings,
  setSeoAdvancedSettings,
  type SeoAdvancedSettings,
} from '@/lib/storage';
import { getBlacklist } from '@/lib/storage';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  Download,
  X,
  Search as SearchIcon,
} from 'lucide-react';
import { SignalPill, type SignalTone } from '@/components/ui/SignalPill';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { LeadsTable } from '@/components/LeadsTable';
import { CityCombobox } from '@/components/CityCombobox';
import type { LeadRow } from '@/lib/types';
import { mapExtraDataToSeo, mapExtraDataToIssues } from '@/lib/searchResultMapping';
import { toast } from '@/components/ui/toast';
import { PageContainer } from '@/components/ui/page';

const PROVIDERS: Record<string, string> = {
  yandex_xml: 'Яндекс XML (ключи)',
  yandex_html: 'Яндекс HTML (бесплатно)',
  google_html: 'Google HTML (бесплатно)',
  serpapi: 'SerpAPI (deprecated)',
};

const PRESETS = [
  'купить {товар} {город}',
  '{услуга} {город} телефон',
  '{ниша} {город} контакты',
  '{ниша} {город} сайт',
  'ремонт окон {город}',
  'доставка еды {город}',
  'автосервис {город} телефон',
  'стоматология {город} контакты',
];

const DEPTH_OPTIONS = [10, 20, 50, 100];

const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const AUDIT_POLLING_GRACE_MS = 3 * 60 * 1000;

function getAdaptiveInterval(elapsedMs: number): number {
  if (elapsedMs > 90_000) return 8_000;
  if (elapsedMs > 30_000) return 4_000;
  return 2_000;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(s: string): string {
  if (s === 'completed') return 'OK';
  if (s === 'failed') return 'Ошибка';
  if (s === 'processing' || s === 'running') return 'В работе';
  return 'Ожидание';
}

// §4.9 ТЗ редизайна 2026-06-03 (Phase C batch 2): статус запуска → SignalPill.
function statusTone(s: string): SignalTone {
  if (s === 'completed') return 'good';
  if (s === 'failed') return 'hot';
  if (s === 'processing' || s === 'running' || s === 'pending') return 'warm';
  return 'muted';
}

export default function SeoPage() {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('Москва');
  const [yandexRegionId, setYandexRegionId] = useState(213);
  const [searchProvider, setSearchProvider] = useState('yandex_xml');
  const [advanced, setAdvanced] = useState<SeoAdvancedSettings>(() => getSeoAdvancedSettings());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recentRuns, setRecentRuns] = useState<SearchResponse[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [showMorePresets, setShowMorePresets] = useState(false);

  const [hasBlacklist, setHasBlacklist] = useState(false);
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);

  useEffect(() => {
    setHasBlacklist(getBlacklist().length > 0);
  }, []);

  useEffect(() => {
    getOutreachTemplates().then(setTemplates);
  }, []);

  // Inline run state
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [activeSearch, setActiveSearch] = useState<SearchResponse | null>(null);
  const [activeResults, setActiveResults] = useState<LeadRow[]>([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activePollTimeout, setActivePollTimeout] = useState(false);
  const [activeLastUpdated, setActiveLastUpdated] = useState<Date | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Polling refs
  const activeRef = useRef(true);
  const processingStartRef = useRef<number | null>(null);
  const auditUntilRef = useRef<number>(0);
  const lastCountRef = useRef<number>(-1);
  const lastStatusRef = useRef<string>('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasProcessingRef = useRef<boolean>(false);

  const loadRecent = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await listSearches({ limit: 20, offset: 0 });
      setRecentRuns(data.slice(0, 20));
    } catch {
      setRecentRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    setSeoAdvancedSettings(advanced);
  }, [advanced]);

  // Polling effect for active run
  useEffect(() => {
    if (activeRunId === null) return;

    activeRef.current = true;
    processingStartRef.current = null;
    lastCountRef.current = -1;
    lastStatusRef.current = '';
    hasProcessingRef.current = false;
    setActivePollTimeout(false);
    setActiveLoading(true);
    setActiveSearch(null);
    setActiveResults([]);

    const schedule = (delayMs: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (!activeRef.current) return;
      try {
        const searchData = await getSearch(activeRunId);
        if (!activeRef.current) return;
        setActiveSearch(searchData);

        const countChanged = searchData.result_count !== lastCountRef.current;
        const statusChanged = searchData.status !== lastStatusRef.current;
        const auditActive = Date.now() < auditUntilRef.current;
        const isProcessing = searchData.status === 'processing' || searchData.status === 'pending';

        // Always fetch results while processing to see real-time SEO updates
        // Also fetch if domains are still being processed (contact_status not set yet)
        const needsResults =
          countChanged ||
          statusChanged ||
          auditActive ||
          lastCountRef.current === -1 ||
          isProcessing ||
          hasProcessingRef.current;

        if (needsResults) {
          const resultsData = await getSearchResults(activeRunId);
          if (!activeRef.current) return;

          const rows: LeadRow[] = resultsData.map((r) => {
            const status: 'ok' | 'error' | 'processing' =
              r.contact_status === 'found' || r.contact_status === 'no_contacts'
                ? 'ok'
                : r.contact_status === 'failed'
                  ? 'error'
                  : 'processing';
            return {
              id: String(r.id),
              domain: r.domain || '',
              phone: r.phone ?? null,
              email: r.email ?? null,
              score: r.seo_score ?? 0,
              issues: mapExtraDataToIssues(r.extra_data),
              seo: mapExtraDataToSeo(r.extra_data),
              status,
              outreachText: r.outreach_text || '',
              outreachSubject: r.outreach_subject ?? null,
              titleFromSearch: r.title ?? null,
              snippetFromSearch: r.snippet ?? null,
              urlFromSearch: r.url ?? null,
            };
          });

          // Check if any domains are still being processed
          const hasProcessingDomains = rows.some((r) => r.status === 'processing');
          hasProcessingRef.current = hasProcessingDomains;

          setActiveResults(rows);
          setActiveLastUpdated(new Date());
          lastCountRef.current = searchData.result_count;
          lastStatusRef.current = searchData.status;
        }

        // Stop polling only if search is done AND no domains are processing AND audit grace period is over
        if (
          (searchData.status === 'completed' || searchData.status === 'failed') &&
          !hasProcessingRef.current &&
          Date.now() >= auditUntilRef.current
        ) {
          // Refresh the recent runs list when a run finishes
          loadRecent();
          return;
        }

        // Continue polling if search is in progress OR domains are still being processed
        if (
          searchData.status === 'pending' ||
          searchData.status === 'processing' ||
          hasProcessingRef.current
        ) {
          if (processingStartRef.current === null) processingStartRef.current = Date.now();
          const elapsed = Date.now() - (processingStartRef.current ?? 0);
          if (elapsed > POLL_TIMEOUT_MS) {
            setActivePollTimeout(true);
            return;
          }
          schedule(getAdaptiveInterval(elapsed));
        } else {
          schedule(8_000);
        }
      } catch {
        if (activeRef.current) schedule(5_000);
      } finally {
        if (activeRef.current) setActiveLoading(false);
      }
    };

    tick();

    return () => {
      activeRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [activeRunId, refreshTrigger, loadRecent]);

  const query = `${keyword.trim()} ${city}`.trim();
  const isValid = keyword.trim().length >= 3 && city && searchProvider;
  const invalidReason =
    !keyword.trim() || keyword.trim().length < 3
      ? 'Введите запрос (мин. 3 символа)'
      : !city
        ? 'Выберите город'
        : !searchProvider
          ? 'Выберите провайдер'
          : null;

  const handlePreset = (template: string) => {
    const withCity = template.replace(/\{город\}/g, city);
    setKeyword(withCity);
    const input = document.getElementById('seo-keyword-input');
    if (input) (input as HTMLInputElement).focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValid || isLoading) return;
    setIsLoading(true);
    try {
      const search = await createSearch({
        query,
        search_provider: searchProvider,
        num_results: advanced.depth,
        config: {
          filter_phone: advanced.filterPhone,
          filter_email: advanced.filterEmail,
          exclude_blacklist: advanced.excludeBlacklist,
          yandex_region_id: yandexRegionId,
          ...(templateId != null && { template_id: templateId }),
        },
      });
      // Reset polling refs before setting new run
      activeRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      auditUntilRef.current = 0;
      setActiveRunId(search.id);
      toast.success('Запуск создан');
      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (err as { message?: string })?.message ||
        'Ошибка при создании поиска';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setKeyword('');
    setCity('Москва');
    setSearchProvider('yandex_xml');
    setTemplateId(null);
    setAdvanced(getSeoAdvancedSettings());
  };

  const handleCloseResults = () => {
    activeRef.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveRunId(null);
    setActiveSearch(null);
    setActiveResults([]);
  };

  const displayedPresets = showMorePresets ? PRESETS : PRESETS.slice(0, 6);

  const filtersLabel =
    [
      advanced.filterPhone && 'телефон',
      advanced.filterEmail && 'email',
      advanced.excludeBlacklist && 'blacklist',
    ]
      .filter(Boolean)
      .join(', ') || '—';

  // Inline results computed values
  const searchStatus = activeSearch?.status || '';
  const isProcessing = searchStatus === 'processing' || searchStatus === 'pending';
  const expectedResults = activeSearch?.num_results || 100;
  const progressPercent =
    isProcessing && expectedResults > 0
      ? Math.min(100, Math.round((activeResults.length / expectedResults) * 100))
      : searchStatus === 'completed'
        ? 100
        : 0;
  const configError =
    activeSearch?.config && typeof activeSearch.config === 'object'
      ? (activeSearch.config as Record<string, unknown>).error
      : null;

  return (
    <PageContainer className="min-w-0 overflow-x-hidden">
      <h1 className="flex items-center gap-2 mb-4 sm:mb-6 font-display font-semibold tracking-tight text-heading text-ui-text">
        <SearchIcon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        Поиск / SEO-аудит
      </h1>
      <div className="space-y-4 sm:space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="flex items-center h-8 px-2.5 rounded-v2-sm text-sm font-medium bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
          >
            SEO
          </button>
          <button
            type="button"
            disabled
            title="Скоро будет доступно"
            className="flex items-center h-8 px-2.5 rounded-v2-sm text-sm font-medium opacity-50 cursor-not-allowed text-ui-text-muted"
          >
            Контакты
            <span className="ml-2">
              <SignalPill tone="warm" size="sm">
                Скоро
              </SignalPill>
            </span>
          </button>
          <button
            type="button"
            disabled
            title="Скоро будет доступно"
            className="flex items-center h-8 px-2.5 rounded-v2-sm text-sm font-medium opacity-50 cursor-not-allowed text-ui-text-muted"
          >
            Мониторинг цен
            <span className="ml-2">
              <SignalPill tone="warm" size="sm">
                Скоро
              </SignalPill>
            </span>
          </button>
        </div>

        {/* Form */}
        <div className="app-card-enhanced p-4 sm:p-5 md:p-6">
          <p className="text-small mb-4 text-ui-text-muted">
            Укажите ключевое слово, провайдер и город. Результат: домены, SEO-оценка, контакты.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-0 w-full sm:min-w-[200px]">
                <label className="block text-xs sm:text-sm font-medium mb-1 text-ui-text">
                  Ключевое слово
                </label>
                <Input
                  id="seo-keyword-input"
                  type="text"
                  placeholder="Например: ремонт окон"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  disabled={isLoading}
                  className="w-full border-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1 w-full sm:w-auto min-w-0">
                <label className="block text-xs sm:text-sm font-medium text-ui-text">Город</label>
                <CityCombobox
                  city={city}
                  onCityChange={(c, id) => {
                    setCity(c);
                    if (id !== undefined) setYandexRegionId(id);
                  }}
                  disabled={isLoading}
                  className="w-full sm:w-[220px] min-w-0"
                />
              </div>
              <div className="w-full sm:w-[220px] min-w-0">
                <label className="block text-xs sm:text-sm font-medium mb-1 text-ui-text">
                  Провайдер
                </label>
                <Select
                  value={searchProvider}
                  onChange={(e) => setSearchProvider(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                >
                  <option value="yandex_xml">Яндекс XML (ключи)</option>
                  <option value="yandex_html">Яндекс HTML (бесплатно)</option>
                  <option value="google_html">Google HTML (бесплатно)</option>
                  <option value="serpapi" disabled>
                    SerpAPI (deprecated)
                  </option>
                </Select>
              </div>
              <div className="w-full sm:w-[240px] min-w-0">
                <label className="block text-xs sm:text-sm font-medium mb-1 text-ui-text">
                  Шаблон КП
                </label>
                <Select
                  value={templateId == null ? '' : String(templateId)}
                  onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
                  disabled={isLoading}
                  className="w-full"
                >
                  <option value="">Без шаблона</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </form>
        </div>

        {/* Validation hint between cards */}
        <p
          className="text-xs text-signal-warm -mt-3"
          style={{ visibility: invalidReason ? 'visible' : 'hidden', minHeight: '1rem' }}
        >
          {invalidReason || '\u00a0'}
        </p>

        {/* Horizontal summary bar */}
        <div className="app-card-enhanced px-3 py-3 sm:px-4 sm:py-3.5 md:px-5 md:py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-small font-semibold shrink-0 text-ui-text">Сводка запуска</span>
            <div className="h-4 w-px shrink-0 hidden sm:block bg-ui-border" />
            <div className="flex items-center gap-x-5 flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5 text-small shrink-0">
                <span className="whitespace-nowrap text-ui-text-muted">Запрос:</span>
                <span
                  className="font-medium truncate max-w-[160px] text-ui-text"
                  title={query || '—'}
                >
                  {query || '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-small shrink-0">
                <span className="whitespace-nowrap text-ui-text-muted">Провайдер:</span>
                <span
                  className="font-medium truncate max-w-[200px] text-ui-text"
                  title={PROVIDERS[searchProvider] || searchProvider}
                >
                  {PROVIDERS[searchProvider] || searchProvider}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-small shrink-0">
                <span className="whitespace-nowrap text-ui-text-muted">Город:</span>
                <span
                  className="font-medium truncate max-w-[120px] text-ui-text"
                  title={city || '—'}
                >
                  {city || '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-small shrink-0">
                <span className="whitespace-nowrap text-ui-text-muted">Глубина:</span>
                <span className="font-medium whitespace-nowrap text-ui-text">
                  Top {advanced.depth}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-small shrink-0">
                <span className="whitespace-nowrap text-ui-text-muted">Фильтры:</span>
                <span
                  className="font-medium truncate max-w-[120px] text-ui-text"
                  title={filtersLabel}
                >
                  {filtersLabel}
                </span>
              </div>
              {templates.length > 0 && (
                <div className="flex items-center gap-1.5 text-small shrink-0">
                  <span className="whitespace-nowrap text-ui-text-muted">Шаблон КП:</span>
                  <span className="font-medium truncate max-w-[140px] text-ui-text">
                    {templateId != null
                      ? (templates.find((t) => t.id === templateId)?.name ?? '—')
                      : 'Без шаблона'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isLoading}
                className="h-8 px-3 text-sm"
              >
                Сбросить
              </Button>
              <Button
                onClick={() => handleSubmit()}
                disabled={!isValid || isLoading}
                className="h-8 px-4 text-sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Запуск…
                  </>
                ) : (
                  'Запустить'
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Presets */}
        <div>
          <h3 className="text-sm font-medium mb-2 text-ui-text">Быстрые шаблоны</h3>
          <div className="flex flex-wrap gap-2">
            {displayedPresets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePreset(p)}
                className="px-3 py-1.5 rounded-pill text-small border border-ui-border text-ui-text transition-colors hover:bg-ui-surface-2 hover:border-brand-500/40"
              >
                {p}
              </button>
            ))}
            {PRESETS.length > 6 && (
              <button
                type="button"
                onClick={() => setShowMorePresets(!showMorePresets)}
                className="px-3 py-1.5 rounded-pill text-small font-medium text-brand-600 dark:text-brand-400"
              >
                {showMorePresets ? 'Свернуть' : 'Показать ещё'}
              </button>
            )}
          </div>
        </div>

        {/* Advanced settings */}
        <div className="app-card-enhanced">
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
            style={{ '--tw-bg-opacity': '1' } as React.CSSProperties}
          >
            <span className="text-sm font-medium text-ui-text">Расширенные настройки</span>
            {advancedOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {advancedOpen && (
            <div className="px-4 pb-4 pt-0 space-y-4 border-t border-ui-border">
              <div>
                <label className="block text-sm font-medium mb-1 text-ui-text">
                  Глубина (Top N)
                </label>
                <Select
                  value={String(advanced.depth)}
                  onChange={(e) => setAdvanced((a) => ({ ...a, depth: Number(e.target.value) }))}
                  className="w-[120px]"
                >
                  {DEPTH_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      Top {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advanced.filterPhone}
                    onChange={(e) => setAdvanced((a) => ({ ...a, filterPhone: e.target.checked }))}
                    className="rounded border-ui-border"
                  />
                  <span className="text-sm text-ui-text">Только с телефоном</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advanced.filterEmail}
                    onChange={(e) => setAdvanced((a) => ({ ...a, filterEmail: e.target.checked }))}
                    className="rounded border-ui-border"
                  />
                  <span className="text-sm text-ui-text">Только с email</span>
                </label>
                {hasBlacklist && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advanced.excludeBlacklist}
                      onChange={(e) =>
                        setAdvanced((a) => ({ ...a, excludeBlacklist: e.target.checked }))
                      }
                      className="rounded border-ui-border"
                    />
                    <span className="text-sm text-ui-text">Исключать blacklist</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advanced.saveToHistory}
                    onChange={(e) =>
                      setAdvanced((a) => ({ ...a, saveToHistory: e.target.checked }))
                    }
                    className="rounded border-ui-border"
                  />
                  <span className="text-sm text-ui-text">Сохранять в историю</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Inline results panel */}
        {activeRunId !== null && (
          <div ref={resultsRef} className="app-card-enhanced">
            {/* Results header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-ui-border bg-ui-surface-2">
              <div className="flex flex-wrap items-center gap-4 text-sm text-ui-text">
                <span className="font-semibold text-ui-text">Результаты</span>
                {activeSearch && (
                  <>
                    <span className="text-ui-text-muted">|</span>
                    <span>
                      <span className="text-ui-text-muted">Запрос:</span> {activeSearch.query}
                    </span>
                    <span>
                      <span className="text-ui-text-muted">Провайдер:</span>{' '}
                      {activeSearch.search_provider}
                    </span>
                    <span>
                      <span className="text-ui-text-muted">Найдено:</span> {activeResults.length}
                    </span>
                    {activeLastUpdated && (
                      <span className="text-xs text-ui-text-muted">
                        Обновлено: {activeLastUpdated.toLocaleTimeString('ru-RU')}
                      </span>
                    )}
                  </>
                )}
                {activeLoading && !activeSearch && (
                  <span className="flex items-center gap-1.5 text-ui-text-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Загрузка…
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeResults.length > 0 && (
                  <a
                    href={`/api/v1/searches/${activeRunId}/results/export/csv`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-v2-sm border border-ui-border bg-ui-surface px-3 py-1.5 text-sm font-medium text-ui-text transition-colors hover:bg-ui-surface-2"
                  >
                    <Download className="h-4 w-4" />
                    CSV
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleCloseResults}
                  title="Закрыть результаты"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-v2-sm transition-colors hover:bg-ui-surface-2 hover:text-ui-text text-ui-text-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Progress bar */}
              {isProcessing && (
                <div className="rounded-v2-sm border border-ui-border bg-ui-surface-2 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-ui-text">Сбор результатов…</span>
                    <span className="text-sm text-ui-text-muted">{progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-pill overflow-hidden bg-ui-border">
                    <div
                      className="h-full bg-brand-600 transition-all duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ui-text-muted">
                    Найдено {activeResults.length} из {expectedResults} результатов
                  </p>
                </div>
              )}

              {/* Error state */}
              {searchStatus === 'failed' && (
                <div className="rounded-v2-sm border border-[color:var(--signal-hot)]/30 bg-[var(--signal-hot-bg)] p-4">
                  <h3 className="mb-1 text-sm font-semibold text-signal-hot">Поиск не удался</h3>
                  <p className="text-sm text-signal-hot">
                    {typeof configError === 'string' ? configError : 'Неизвестная ошибка'}
                  </p>
                  <p className="mt-2 text-xs text-ui-text-muted">
                    Часто Яндекс/Google блокируют запросы с серверов. Попробуйте DuckDuckGo или
                    Яндекс XML с API-ключами.
                  </p>
                </div>
              )}

              {/* Timeout warning */}
              {activePollTimeout && (
                <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] p-4">
                  <h3 className="mb-1 text-sm font-semibold text-signal-warm">
                    Поиск занимает необычно долго
                  </h3>
                  <p className="text-sm text-signal-warm">
                    Обновление данных остановлено по тайм-ауту (5 минут). Обновите страницу или
                    попробуйте другой провайдер.
                  </p>
                </div>
              )}

              {activeResults.length === 0 && !isProcessing && searchStatus === 'completed' && (
                <p className="py-6 text-center text-sm text-ui-text-muted">Результаты не найдены</p>
              )}

              {activeResults.length > 0 && (
                <LeadsTable
                  results={activeResults}
                  runId={String(activeRunId)}
                  onAuditComplete={() => {
                    auditUntilRef.current = Date.now() + AUDIT_POLLING_GRACE_MS;
                    setRefreshTrigger((t) => t + 1);
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Last runs */}
        <div className="app-card-enhanced">
          <h3 className="text-small sm:text-sm font-medium px-3 py-2.5 sm:px-4 sm:py-3 border-b border-ui-border text-ui-text">
            Последние SEO-запуски
          </h3>
          {runsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 rounded-v2-sm skel-v2" />
              ))}
            </div>
          ) : recentRuns.length === 0 ? (
            <div className="p-6 text-center text-sm text-ui-text-muted">
              Запусков пока нет — сделайте первый запуск
            </div>
          ) : (
            <>
              {/* Mobile: список карточек */}
              <div className="md:hidden divide-y divide-ui-border">
                {recentRuns.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-1.5 py-2.5 px-3 active:bg-brand-50 dark:active:bg-brand-500/10"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="text-small font-semibold truncate flex-1 text-ui-text"
                        title={r.query}
                      >
                        {r.query}
                      </span>
                      <SignalPill tone={statusTone(r.status)} size="sm">
                        {statusLabel(r.status)}
                      </SignalPill>
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs text-ui-text-muted">
                      <span>{formatDateTime(r.created_at)}</span>
                      <span>
                        {r.result_count ?? 0} доменов ·{' '}
                        {PROVIDERS[r.search_provider] ?? r.search_provider}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        activeRef.current = false;
                        if (timeoutRef.current) clearTimeout(timeoutRef.current);
                        auditUntilRef.current = 0;
                        hasProcessingRef.current = false;
                        setActiveRunId(r.id);
                        setTimeout(() => {
                          resultsRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          });
                        }, 150);
                      }}
                      className="mt-0.5 self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-v2-sm text-xs font-medium border border-ui-border bg-ui-surface text-ui-text transition-colors hover:bg-ui-surface-2"
                    >
                      <Eye className="h-3 w-3" /> Открыть
                    </button>
                  </div>
                ))}
              </div>

              {/* Desktop: таблица */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ui-border bg-ui-surface-2">
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-ui-text-muted">
                        Дата/время
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-ui-text-muted">
                        Запрос
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-ui-text-muted">
                        Провайдер
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-ui-text-muted">
                        Статус
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-ui-text-muted">
                        Доменов
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-ui-text-muted">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b transition-colors hover:bg-ui-surface-2 border-ui-border"
                      >
                        <td className="py-2 px-3 whitespace-nowrap text-ui-text-muted">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td
                          className="py-2 px-3 truncate max-w-[180px] text-ui-text"
                          title={r.query}
                        >
                          {r.query}
                        </td>
                        <td className="py-2 px-3 text-ui-text-muted">{r.search_provider}</td>
                        <td className="py-2 px-3">
                          <SignalPill tone={statusTone(r.status)} size="sm">
                            {statusLabel(r.status)}
                          </SignalPill>
                        </td>
                        <td className="py-2 px-3 text-ui-text">{r.result_count ?? 0}</td>
                        <td className="py-2 px-3 text-right">
                          <ButtonV2
                            variant="secondary"
                            size="sm"
                            iconLeft={<Eye />}
                            onClick={() => {
                              activeRef.current = false;
                              if (timeoutRef.current) clearTimeout(timeoutRef.current);
                              auditUntilRef.current = 0;
                              hasProcessingRef.current = false;
                              setActiveRunId(r.id);
                              setTimeout(() => {
                                resultsRef.current?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'start',
                                });
                              }, 150);
                            }}
                          >
                            Открыть
                          </ButtonV2>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>{' '}
    </PageContainer>
  );
}
