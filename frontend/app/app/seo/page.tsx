'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ToastContainer, type Toast } from '@/components/Toast';
import { createSearch, listSearches } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import { getSeoAdvancedSettings, setSeoAdvancedSettings, type SeoAdvancedSettings } from '@/lib/storage';
import { getBlacklist } from '@/lib/storage';
import { Loader2, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const RUSSIAN_CITIES = [
  'Москва', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Новосибирск',
  'Краснодар', 'Нижний Новгород', 'Ростов-на-Дону', 'Самара', 'Омск',
  'Челябинск', 'Уфа', 'Пермь', 'Воронеж', 'Волгоград', 'Красноярск',
  'Саратов', 'Тюмень', 'Тольятти', 'Ижевск', 'Барнаул', 'Ульяновск',
  'Иркутск', 'Хабаровск', 'Ярославль', 'Владивосток', 'Махачкала', 'Томск', 'Оренбург', 'Кемерово',
];

const PROVIDERS: Record<string, string> = {
  duckduckgo: 'DuckDuckGo (бесплатно)',
  yandex_html: 'Яндекс HTML (бесплатно)',
  google_html: 'Google HTML (бесплатно)',
  yandex_xml: 'Яндекс XML (требует ключи)',
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
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('Москва');
  const [searchProvider, setSearchProvider] = useState('duckduckgo');
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

  const loadRecent = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await listSearches();
      setRecentRuns(data.slice(0, 10));
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
    setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'success', message: 'Запуск создан' }]);
    try {
      const search = await createSearch({
        query,
        search_provider: searchProvider,
        num_results: advanced.depth,
        config: {
          filter_phone: advanced.filterPhone,
          filter_email: advanced.filterEmail,
          exclude_blacklist: advanced.excludeBlacklist,
        },
      });
      router.push(`/runs/${search.id}`);
    } catch (err: unknown) {
      setIsLoading(false);
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Ошибка при создании поиска';
      setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'error', message: msg }]);
    }
  };

  const handleReset = () => {
    setKeyword('');
    setCity('Москва');
    setSearchProvider('duckduckgo');
    setAdvanced(getSeoAdvancedSettings());
  };

  const displayedPresets = showMorePresets ? PRESETS : PRESETS.slice(0, 6);

  return (
    <div className="mx-auto max-w-[1250px] px-6 py-8 overflow-x-hidden">
      <h1 className="text-[20px] font-semibold mb-6" style={{ color: 'hsl(var(--text))' }}>
        Поиск / SEO-аудит
      </h1>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column 8/12 */}
        <div className="lg:col-span-8 space-y-6">
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
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
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
                    className="w-full"
                  />
                </div>
                <div className="w-[180px]">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Город</label>
                  <Select value={city} onChange={(e) => setCity(e.target.value)} disabled={isLoading} className="w-full">
                    <option value="">Выберите город</option>
                    {RUSSIAN_CITIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </div>
                <div className="w-[220px]">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Провайдер</label>
                  <Select value={searchProvider} onChange={(e) => setSearchProvider(e.target.value)} disabled={isLoading} className="w-full">
                    <option value="duckduckgo">DuckDuckGo (бесплатно)</option>
                    <option value="yandex_html">Яндекс HTML (бесплатно)</option>
                    <option value="google_html">Google HTML (бесплатно)</option>
                    <option value="yandex_xml">Яндекс XML (требует ключи)</option>
                    <option value="serpapi" disabled>SerpAPI (deprecated)</option>
                  </Select>
                </div>
              </div>
            </form>
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
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className="text-[14px] font-medium" style={{ color: 'hsl(var(--text))' }}>Расширенные настройки</span>
              {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {advancedOpen && (
              <div className="px-4 pb-4 pt-0 space-y-4 border-t border-gray-200 dark:border-gray-700">
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

          {/* Last runs */}
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <h3 className="text-[14px] font-medium px-4 py-3 border-b border-gray-200 dark:border-gray-700" style={{ color: 'hsl(var(--text))' }}>
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
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Дата/время</th>
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Запрос</th>
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Провайдер</th>
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Статус</th>
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Доменов</th>
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
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
                            onClick={() => router.push(`/runs/${r.id}`)}
                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0 font-inherit"
                          >
                            Открыть <ExternalLink className="h-3.5 w-3.5" />
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

        {/* Right column 4/12 */}
        <div className="lg:col-span-4 space-y-6 order-first lg:order-none">
          {/* Summary card */}
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm sticky top-4">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'hsl(var(--text))' }}>Сводка запуска</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Запрос:</span>
                <p className="truncate mt-0.5" title={query || '—'} style={{ color: 'hsl(var(--text))' }}>{query || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Провайдер:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>{PROVIDERS[searchProvider] || searchProvider}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Город:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>{city || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Глубина:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>Top {advanced.depth}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Фильтры:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>
                  {[advanced.filterPhone && 'телефон', advanced.filterEmail && 'email', advanced.excludeBlacklist && 'blacklist'].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Оценка доменов:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>—</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Примерная стоимость:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>—</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                onClick={() => handleSubmit()}
                disabled={!isValid || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Запуск…
                  </>
                ) : (
                  'Запустить'
                )}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={isLoading} className="w-full">
                Сбросить
              </Button>
              {invalidReason && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{invalidReason}</p>
              )}
            </div>
          </div>

          {/* Example result */}
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
            <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'hsl(var(--text))' }}>Что вы получите</h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400">domain.ru</span>
                <span className="text-gray-500 dark:text-gray-400">+7 …</span>
                <span className="text-gray-500 dark:text-gray-400 truncate">mail@…</span>
              </div>
              <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400">example.com</span>
                <span className="text-gray-500 dark:text-gray-400">—</span>
                <span className="text-gray-500 dark:text-gray-400 truncate">info@…</span>
              </div>
              <div className="flex justify-between gap-2 py-1.5">
                <span className="text-gray-500 dark:text-gray-400">site.org</span>
                <span className="text-gray-500 dark:text-gray-400">+7 …</span>
                <span className="text-gray-500 dark:text-gray-400">—</span>
              </div>
            </div>
            <p className="mt-3 text-[12px] text-gray-500 dark:text-gray-400">Данные появятся после запуска</p>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
