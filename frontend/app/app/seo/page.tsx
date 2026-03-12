'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ToastContainer, type Toast } from '@/components/Toast';
import { createSearch, listSearches, getSearch, getSearchResults } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import { getSeoAdvancedSettings, setSeoAdvancedSettings, type SeoAdvancedSettings } from '@/lib/storage';
import { getBlacklist } from '@/lib/storage';
import { Loader2, ChevronDown, ChevronRight, Eye, Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadsTable } from '@/components/LeadsTable';
import { CityCombobox } from '@/components/CityCombobox';
import type { LeadRow } from '@/lib/types';
import { mapExtraDataToSeo, mapExtraDataToIssues } from '@/lib/searchResultMapping';


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
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(s: string): string {
  if (s === 'completed') return 'OK';
  if (s === 'failed') return 'Ошибка';
  if (s === 'processing' || s === 'running') return 'В работе';
  return 'Ожидание';
}

export default function SeoPage() {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('Москва');
  const [yandexRegionId, setYandexRegionId] = useState(213);
  const [searchProvider, setSearchProvider] = useState('yandex_xml');
  const [advanced, setAdvanced] = useState<SeoAdvancedSettings>(() => getSeoAdvancedSettings());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recentRuns, setRecentRuns] = useState<SearchResponse[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [showMorePresets, setShowMorePresets] = useState(false);

  const [hasBlacklist, setHasBlacklist] = useState(false);
  useEffect(() => {
    setHasBlacklist(getBlacklist().length > 0);
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
        // Otherwise only fetch when count/status changes
        const needsResults = countChanged || statusChanged || auditActive || lastCountRef.current === -1 || isProcessing;

        if (needsResults) {
          const resultsData = await getSearchResults(activeRunId);
          if (!activeRef.current) return;

          const rows: LeadRow[] = resultsData.map((r) => {
            const status: 'ok' | 'error' | 'processing' =
              r.contact_status === 'found' || r.contact_status === 'no_contacts' ? 'ok'
                : r.contact_status === 'failed' ? 'error'
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
          setActiveResults(rows);
          setActiveLastUpdated(new Date());
          lastCountRef.current = searchData.result_count;
          lastStatusRef.current = searchData.status;
        }

        if ((searchData.status === 'completed' || searchData.status === 'failed') && Date.now() >= auditUntilRef.current) {
          // Refresh the recent runs list when a run finishes
          loadRecent();
          return;
        }

        if (searchData.status === 'pending' || searchData.status === 'processing') {
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
  const invalidReason = !keyword.trim() || keyword.trim().length < 3
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
        },
      });
      // Reset polling refs before setting new run
      activeRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      auditUntilRef.current = 0;
      setActiveRunId(search.id);
      setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'success', message: 'Запуск создан' }]);
      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Ошибка при создании поиска';
      setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'error', message: msg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setKeyword('');
    setCity('Москва');
    setSearchProvider('yandex_xml');
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

  const filtersLabel = [
    advanced.filterPhone && 'телефон',
    advanced.filterEmail && 'email',
    advanced.excludeBlacklist && 'blacklist',
  ].filter(Boolean).join(', ') || '—';

  // Inline results computed values
  const searchStatus = activeSearch?.status || '';
  const isProcessing = searchStatus === 'processing' || searchStatus === 'pending';
  const expectedResults = activeSearch?.num_results || 100;
  const progressPercent = isProcessing && expectedResults > 0
    ? Math.min(100, Math.round((activeResults.length / expectedResults) * 100))
    : searchStatus === 'completed' ? 100 : 0;
  const configError = activeSearch?.config && typeof activeSearch.config === 'object'
    ? (activeSearch.config as Record<string, unknown>).error
    : null;

  return (
    <div className="mx-auto max-w-[1250px] px-6 py-8 overflow-x-hidden">
      <h1 className="text-[20px] font-semibold mb-6" style={{ color: 'hsl(var(--text))' }}>
        Поиск / SEO-аудит
      </h1>

      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="flex items-center h-8 px-2.5 rounded-[10px] text-sm font-medium bg-saas-primary-weak text-saas-primary"
          >
            SEO
          </button>
          <button
            type="button"
            disabled
            title="Скоро будет доступно"
            className="flex items-center h-8 px-2.5 rounded-[10px] text-sm font-medium opacity-50 cursor-not-allowed text-gray-500 dark:text-gray-400"
          >
            Контакты
            <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-[6px]">Скоро</span>
          </button>
          <button
            type="button"
            disabled
            title="Скоро будет доступно"
            className="flex items-center h-8 px-2.5 rounded-[10px] text-sm font-medium opacity-50 cursor-not-allowed text-gray-500 dark:text-gray-400"
          >
            Мониторинг цен
            <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-[6px]">Скоро</span>
          </button>
        </div>

        {/* Form */}
        <div className="app-card-enhanced p-6">
          <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-4">
            Укажите ключевое слово, провайдер и город. Результат: домены, SEO-оценка, контакты.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ключевое слово</label>
                <Input
                  id="seo-keyword-input"
                  type="text"
                  placeholder="Например: ремонт окон"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  disabled={isLoading}
                  className="w-full border-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Город</label>
                <CityCombobox
                  city={city}
                  onCityChange={(c, id) => { setCity(c); if (id !== undefined) setYandexRegionId(id); }}
                  disabled={isLoading}
                  className="w-[220px]"
                />
              </div>
              <div className="w-[220px]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Провайдер</label>
                <Select value={searchProvider} onChange={(e) => setSearchProvider(e.target.value)} disabled={isLoading} className="w-full">
                  <option value="yandex_xml">Яндекс XML (ключи)</option>
                  <option value="yandex_html">Яндекс HTML (бесплатно)</option>
                  <option value="google_html">Google HTML (бесплатно)</option>
                  <option value="serpapi" disabled>SerpAPI (deprecated)</option>
                </Select>
              </div>
            </div>
          </form>
        </div>

        {/* Validation hint between cards */}
        <p className="text-xs text-amber-600 dark:text-amber-400 -mt-3" style={{ visibility: invalidReason ? 'visible' : 'hidden', minHeight: '1rem' }}>{invalidReason || '\u00a0'}</p>

        {/* Horizontal summary bar */}
        <div className="app-card-enhanced px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-[13px] font-semibold shrink-0" style={{ color: 'hsl(var(--text))' }}>Сводка запуска</span>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 shrink-0 hidden sm:block" />
            <div className="flex items-center gap-x-5 flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5 text-[13px] shrink-0">
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">Запрос:</span>
                <span className="font-medium truncate max-w-[160px]" title={query || '—'} style={{ color: 'hsl(var(--text))' }}>{query || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[13px] shrink-0">
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">Провайдер:</span>
                <span className="font-medium truncate max-w-[200px]" title={PROVIDERS[searchProvider] || searchProvider} style={{ color: 'hsl(var(--text))' }}>{PROVIDERS[searchProvider] || searchProvider}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[13px] shrink-0">
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">Город:</span>
                <span className="font-medium truncate max-w-[120px]" title={city || '—'} style={{ color: 'hsl(var(--text))' }}>{city || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[13px] shrink-0">
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">Глубина:</span>
                <span className="font-medium whitespace-nowrap" style={{ color: 'hsl(var(--text))' }}>Top {advanced.depth}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[13px] shrink-0">
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">Фильтры:</span>
                <span className="font-medium truncate max-w-[120px]" title={filtersLabel} style={{ color: 'hsl(var(--text))' }}>{filtersLabel}</span>
              </div>
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
          <h3 className="text-[14px] font-medium text-gray-700 dark:text-gray-300 mb-2">Быстрые шаблоны</h3>
          <div className="flex flex-wrap gap-2">
            {displayedPresets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePreset(p)}
                className="px-3 py-1.5 rounded-full text-[13px] border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                style={{ color: 'hsl(var(--text))' }}
              >
                {p}
              </button>
            ))}
            {PRESETS.length > 6 && (
              <button
                type="button"
                onClick={() => setShowMorePresets(!showMorePresets)}
                className="px-3 py-1.5 rounded-full text-[13px] font-medium"
                style={{ color: 'hsl(var(--accent))' }}
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
            <span className="text-[14px] font-medium" style={{ color: 'hsl(var(--text))' }}>Расширенные настройки</span>
            {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {advancedOpen && (
            <div className="px-4 pb-4 pt-0 space-y-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Глубина (Top N)</label>
                <Select
                  value={String(advanced.depth)}
                  onChange={(e) => setAdvanced((a) => ({ ...a, depth: Number(e.target.value) }))}
                  className="w-[120px]"
                >
                  {DEPTH_OPTIONS.map((d) => (
                    <option key={d} value={d}>Top {d}</option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advanced.filterPhone}
                    onChange={(e) => setAdvanced((a) => ({ ...a, filterPhone: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Только с телефоном</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advanced.filterEmail}
                    onChange={(e) => setAdvanced((a) => ({ ...a, filterEmail: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Только с email</span>
                </label>
                {hasBlacklist && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advanced.excludeBlacklist}
                      onChange={(e) => setAdvanced((a) => ({ ...a, excludeBlacklist: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Исключать blacklist</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advanced.saveToHistory}
                    onChange={(e) => setAdvanced((a) => ({ ...a, saveToHistory: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Сохранять в историю</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Inline results panel */}
        {activeRunId !== null && (
          <div ref={resultsRef} className="app-card-enhanced">
            {/* Results header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
                <span className="font-semibold" style={{ color: 'hsl(var(--text))' }}>Результаты</span>
                {activeSearch && (
                  <>
                    <span className="text-gray-400 dark:text-gray-600">|</span>
                    <span><span className="text-gray-500 dark:text-gray-400">Запрос:</span> {activeSearch.query}</span>
                    <span><span className="text-gray-500 dark:text-gray-400">Провайдер:</span> {activeSearch.search_provider}</span>
                    <span><span className="text-gray-500 dark:text-gray-400">Найдено:</span> {activeResults.length}</span>
                    {activeLastUpdated && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Обновлено: {activeLastUpdated.toLocaleTimeString('ru-RU')}
                      </span>
                    )}
                  </>
                )}
                {activeLoading && !activeSearch && (
                  <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Загрузка…
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeResults.length > 0 && (
                  <a
                    href={`/api/v1/searches/${activeRunId}/results/export/csv`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    CSV
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleCloseResults}
                  title="Закрыть результаты"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Progress bar */}
              {isProcessing && (
                <div className="rounded-[10px] border px-4 py-3" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Сбор результатов…</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Найдено {activeResults.length} из {expectedResults} результатов
                  </p>
                </div>
              )}

              {/* Error state */}
              {searchStatus === 'failed' && (
                <div className="rounded-[10px] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
                  <h3 className="mb-1 text-sm font-semibold text-red-800 dark:text-red-200">Поиск не удался</h3>
                  <p className="text-sm text-red-700 dark:text-red-300">{typeof configError === 'string' ? configError : 'Неизвестная ошибка'}</p>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    Часто Яндекс/Google блокируют запросы с серверов. Попробуйте DuckDuckGo или Яндекс XML с API-ключами.
                  </p>
                </div>
              )}

              {/* Timeout warning */}
              {activePollTimeout && (
                <div className="rounded-[10px] border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <h3 className="mb-1 text-sm font-semibold text-amber-800 dark:text-amber-200">Поиск занимает необычно долго</h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Обновление данных остановлено по тайм-ауту (5 минут). Обновите страницу или попробуйте другой провайдер.
                  </p>
                </div>
              )}

              {activeResults.length === 0 && !isProcessing && searchStatus === 'completed' && (
                <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Результаты не найдены</p>
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
          <h3 className="text-[14px] font-medium px-4 py-3 border-b" style={{ color: 'hsl(var(--text))', borderColor: 'hsl(var(--border))' }}>
            Последние SEO-запуски
          </h3>
          {runsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />
              ))}
            </div>
          ) : recentRuns.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Запусков пока нет — сделайте первый запуск
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Дата/время</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Запрос</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Провайдер</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Статус</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Доменов</th>
                    <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-saas-primary-weak dark:hover:bg-saas-primary-weak/20 transition-colors" style={{ borderColor: 'hsl(var(--border))' }}>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                      <td className="py-2 px-3 truncate max-w-[180px]" title={r.query} style={{ color: 'hsl(var(--text))' }}>{r.query}</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{r.search_provider}</td>
                      <td className="py-2 px-3">
                        <span className={cn(
                          'px-2 py-0.5 rounded text-xs',
                          r.status === 'completed' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                          r.status === 'failed' && 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
                          (r.status === 'processing' || r.status === 'pending') && 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
                        )}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="py-2 px-3">{r.result_count ?? 0}</td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            activeRef.current = false;
                            if (timeoutRef.current) clearTimeout(timeoutRef.current);
                            auditUntilRef.current = 0;
                            setActiveRunId(r.id);
                            setTimeout(() => {
                              resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 150);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" /> Открыть
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
