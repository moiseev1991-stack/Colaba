'use client';

import { useState, useCallback } from 'react';
import { Search, ExternalLink, Loader2, ChevronDown, ChevronRight, FileText, Calendar, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Tender {
  id: string;
  number: string;
  name: string;
  customerName: string;
  price: number | null;
  currency: string;
  status: string;
  publishDate: string;
  endDate: string | null;
  region: string;
  type: string;
  url: string;
}

const PROCUREMENT_TYPES = [
  { value: '', label: 'Все виды' },
  { value: 'fz44', label: 'Закупки по 44-ФЗ' },
  { value: 'fz223', label: 'Закупки по 223-ФЗ' },
  { value: 'pprf615', label: 'Малые закупки' },
];

const SORT_OPTIONS = [
  { value: 'PUBLISH_DATE', label: 'Дата публикации' },
  { value: 'PRICE', label: 'Цена' },
  { value: 'END_DATE', label: 'Дата окончания' },
];

function formatPrice(price: number | null, currency: string): string {
  if (!price) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(price) + ' ' + (currency || 'руб.');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function searchTenders(keyword: string, type: string, sortBy: string, page: number): Promise<{ items: Tender[]; total: number }> {
  // Use the backend proxy to call the search API
  const params = new URLSearchParams({
    searchString: keyword,
    morphology: 'on',
    pageNumber: String(page),
    sortDirection: 'false',
    recordsPerPage: '_10',
    showLotsInfoHidden: 'false',
    sortBy,
    fz44: type === 'fz44' || type === '' ? 'on' : 'off',
    fz223: type === 'fz223' || type === '' ? 'on' : 'off',
    ppRf615: type === 'pprf615' || type === '' ? 'on' : 'off',
    af: 'on',
    ca: 'on',
    pc: 'on',
    pa: 'on',
  });

  // Fetch via backend proxy to avoid CORS
  const resp = await fetch(`/api/v1/tenders/search?${params.toString()}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data;
}

export default function GosPage() {
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('');
  const [sortBy, setSortBy] = useState('PUBLISH_DATE');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Tender[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const doSearch = useCallback(async (p: number = 1) => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    setPage(p);
    try {
      const result = await searchTenders(keyword.trim(), type, sortBy, p);
      setItems(result.items);
      setTotal(result.total);
      setSearched(true);
    } catch (e: unknown) {
      setError((e as Error).message || 'Ошибка загрузки');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [keyword, type, sortBy]);

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <h1 className="text-[20px] font-semibold mb-6" style={{ color: 'hsl(var(--text))' }}>
        Госзакупки
      </h1>

      {/* Форма поиска */}
      <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ключевое слово</label>
            <Input
              type="text"
              placeholder="Например: ремонт дорог, IT-оборудование"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch(1)}
              disabled={loading}
              className="w-full"
            />
          </div>
          <div className="w-[180px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Закон</label>
            <Select value={type} onChange={e => setType(e.target.value)} className="w-full" disabled={loading}>
              {PROCUREMENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div className="w-[180px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Сортировка</label>
            <Select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full" disabled={loading}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <Button onClick={() => doSearch(1)} disabled={!keyword.trim() || loading} className="h-9">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5">Найти</span>
          </Button>
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="mb-4 rounded-[10px] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Результаты */}
      {searched && !loading && (
        <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
          Найдено: <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>{total.toLocaleString('ru-RU')}</span> тендеров
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Поиск…
        </div>
      ) : items.length === 0 && searched ? (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">Тендеры не найдены</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex items-start gap-3"
              >
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug truncate" style={{ color: 'hsl(var(--text))' }}>{item.name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{item.customerName}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(item.publishDate)}</span>
                    <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{formatPrice(item.price, item.currency)}</span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[11px] font-medium',
                      item.status === 'Подача заявок' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                      item.status === 'Завершена' && 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
                      item.status === 'Отмена' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                    )}>{item.status || 'Неизвестно'}</span>
                  </div>
                </div>
                {expandedId === item.id ? <ChevronDown className="h-4 w-4 flex-shrink-0 mt-1" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 mt-1" />}
              </button>

              {expandedId === item.id && (
                <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700">
                  <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-3">
                    <div><dt className="text-gray-500 dark:text-gray-400">Номер</dt><dd style={{ color: 'hsl(var(--text))' }}>{item.number}</dd></div>
                    <div><dt className="text-gray-500 dark:text-gray-400">Тип</dt><dd style={{ color: 'hsl(var(--text))' }}>{item.type}</dd></div>
                    <div><dt className="text-gray-500 dark:text-gray-400">Регион</dt><dd style={{ color: 'hsl(var(--text))' }}>{item.region || '—'}</dd></div>
                    <div><dt className="text-gray-500 dark:text-gray-400">Окончание приёма заявок</dt><dd style={{ color: 'hsl(var(--text))' }}>{formatDate(item.endDate)}</dd></div>
                    <div><dt className="text-gray-500 dark:text-gray-400">НМЦ</dt><dd className="font-medium" style={{ color: 'hsl(var(--text))' }}>{formatPrice(item.price, item.currency)}</dd></div>
                  </dl>
                  <div className="mt-3">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" /> Открыть на zakupki.gov.ru
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Пагинация */}
      {totalPages > 1 && !loading && (
        <div className="mt-6 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>Страница {page} из {totalPages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => doSearch(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              ← Назад
            </button>
            <button
              type="button"
              onClick={() => doSearch(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              Вперёд →
            </button>
          </div>
        </div>
      )}

      {!searched && (
        <div className="py-16 text-center text-gray-400 dark:text-gray-500">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Введите ключевое слово для поиска тендеров на zakupki.gov.ru</p>
        </div>
      )}
    </div>
  );
}
