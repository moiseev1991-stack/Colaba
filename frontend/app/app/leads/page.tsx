'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ToastContainer, type Toast } from '@/components/Toast';
import { createSearch, listSearches } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

const RUSSIAN_CITIES = [
  'Москва', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Новосибирск',
  'Краснодар', 'Нижний Новгород', 'Ростов-на-Дону', 'Самара', 'Омск',
  'Челябинск', 'Уфа', 'Пермь', 'Воронеж', 'Волгоград', 'Красноярск',
  'Саратов', 'Тюмень', 'Тольятти', 'Ижевск', 'Барнаул', 'Ульяновск',
  'Иркутск', 'Хабаровск', 'Ярославль', 'Владивосток', 'Томск', 'Оренбург',
];

const NICHE_PRESETS = [
  'строительные компании {город}',
  'юридические услуги {город}',
  'стоматология {город}',
  'автосервис {город}',
  'доставка еды {город}',
  'клининговая компания {город}',
  'ремонт квартир {город}',
  'бухгалтерские услуги {город}',
  'рекламное агентство {город}',
  'фитнес клуб {город}',
];

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

export default function LeadsPage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('Москва');
  const [provider, setProvider] = useState('duckduckgo');
  const [depth, setDepth] = useState(50);
  const [filterPhone, setFilterPhone] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recentRuns, setRecentRuns] = useState<SearchResponse[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);

  const loadRecent = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await listSearches({ limit: 10, offset: 0 });
      setRecentRuns(data.slice(0, 10));
    } catch {
      setRecentRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const query = `${keyword.trim()} ${city}`.trim();
  const isValid = keyword.trim().length >= 3 && city && provider;

  const handlePreset = (tpl: string) => {
    setKeyword(tpl.replace(/\{город\}/g, city));
  };

  const handleSubmit = async () => {
    if (!isValid || isLoading) return;
    setIsLoading(true);
    setToasts(p => [...p, { id: Date.now().toString(), type: 'success', message: 'Запуск создан' }]);
    try {
      const search = await createSearch({
        query,
        search_provider: provider,
        num_results: depth,
        config: { filter_phone: filterPhone, module: 'leads' },
      });
      router.push(`/runs/${search.id}`);
    } catch (err: unknown) {
      setIsLoading(false);
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Ошибка при создании поиска';
      setToasts(p => [...p, { id: Date.now().toString(), type: 'error', message: msg }]);
    }
  };

  const displayedPresets = showMore ? NICHE_PRESETS : NICHE_PRESETS.slice(0, 6);

  return (
    <div className="mx-auto max-w-[1250px] px-6 py-8 overflow-x-hidden">
      <h1 className="text-[20px] font-semibold mb-6" style={{ color: 'hsl(var(--text))' }}>
        Поиск лидов
      </h1>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Левая колонка */}
        <div className="lg:col-span-8 space-y-6">
          {/* Форма */}
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
            <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-4">
              Введите нишу и город. Система найдёт сайты компаний, выгрузит телефоны, email и outreach-текст.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ниша / ключевое слово</label>
                <Input
                  type="text"
                  placeholder="Например: стоматология"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>
              <div className="w-[180px]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Город</label>
                <Select value={city} onChange={e => setCity(e.target.value)} disabled={isLoading} className="w-full">
                  {RUSSIAN_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="w-[220px]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Провайдер</label>
                <Select value={provider} onChange={e => setProvider(e.target.value)} disabled={isLoading} className="w-full">
                  <option value="duckduckgo">DuckDuckGo (бесплатно)</option>
                  <option value="yandex_html">Яндекс HTML (бесплатно)</option>
                  <option value="google_html">Google HTML (бесплатно)</option>
                  <option value="yandex_xml">Яндекс XML (ключи)</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Шаблоны ниш */}
          <div>
            <h3 className="text-[14px] font-medium text-gray-700 dark:text-gray-300 mb-2">Популярные ниши</h3>
            <div className="flex flex-wrap gap-2">
              {displayedPresets.map(p => (
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
              {NICHE_PRESETS.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowMore(!showMore)}
                  className="px-3 py-1.5 rounded-full text-[13px] font-medium"
                  style={{ color: 'hsl(var(--accent))' }}
                >
                  {showMore ? 'Свернуть' : 'Показать ещё'}
                </button>
              )}
            </div>
          </div>

          {/* Расширенные настройки */}
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
              <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Глубина поиска</label>
                  <Select value={String(depth)} onChange={e => setDepth(Number(e.target.value))} className="w-[140px]">
                    {[10, 20, 50, 100].map(d => <option key={d} value={d}>Top {d}</option>)}
                  </Select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterPhone}
                    onChange={e => setFilterPhone(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <Phone className="h-4 w-4" /> Приоритет: сайты с телефоном
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* История запусков */}
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <h3 className="text-[14px] font-medium px-4 py-3 border-b border-gray-200 dark:border-gray-700" style={{ color: 'hsl(var(--text))' }}>
              Последние запуски
            </h3>
            {runsLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-10 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />)}
              </div>
            ) : recentRuns.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Запусков пока нет — сделайте первый
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Дата</th>
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Запрос</th>
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Статус</th>
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Контактов</th>
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400" />
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map(r => (
                      <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="py-2 px-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                        <td className="py-2 px-3 truncate max-w-[180px]" title={r.query} style={{ color: 'hsl(var(--text))' }}>{r.query}</td>
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
                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 bg-transparent border-0 p-0 text-sm cursor-pointer"
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

        {/* Правая колонка — сводка */}
        <div className="lg:col-span-4 order-first lg:order-none">
          <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm sticky top-4 space-y-4">
            <h2 className="text-[16px] font-semibold" style={{ color: 'hsl(var(--text))' }}>Параметры запуска</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Ниша:</span>
                <p className="truncate mt-0.5" title={query || '—'} style={{ color: 'hsl(var(--text))' }}>{query || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Город:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>{city || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Провайдер:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>{provider}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Глубина:</span>
                <p className="mt-0.5" style={{ color: 'hsl(var(--text))' }}>Top {depth}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Что получите:</p>
              <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-green-600" /> Телефоны компаний</li>
                <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-blue-600" /> Email-адреса</li>
                <li className="flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5 text-gray-400" /> Ссылки на сайты</li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSubmit}
                disabled={!isValid || isLoading}
                className="w-full"
              >
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Запуск…</> : 'Найти лидов'}
              </Button>
              {!isValid && keyword.trim().length < 3 && keyword.trim().length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Введите минимум 3 символа</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={id => setToasts(t => t.filter(x => x.id !== id))} />
    </div>
  );
}
