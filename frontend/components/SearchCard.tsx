'use client';

import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const RUSSIAN_CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Казань',
  'Екатеринбург',
  'Новосибирск',
  'Краснодар',
  'Нижний Новгород',
  'Ростов-на-Дону',
  'Самара',
  'Омск',
  'Челябинск',
  'Уфа',
  'Пермь',
  'Воронеж',
  'Волгоград',
  'Красноярск',
  'Саратов',
  'Тюмень',
  'Тольятти',
  'Ижевск',
  'Барнаул',
  'Ульяновск',
  'Иркутск',
  'Хабаровск',
  'Ярославль',
  'Владивосток',
  'Махачкала',
  'Томск',
  'Оренбург',
  'Кемерово',
];

interface SearchCardProps {
  city: string;
  onCityChange: (city: string) => void;
  onSubmit: (keyword: string, searchProvider: string) => void;
  activeModule?: 'seo' | 'contacts' | 'prices';
  onModuleChange?: (module: 'seo' | 'contacts' | 'prices') => void;
  isLoading?: boolean;
}

export function SearchCard({ city, onCityChange, onSubmit, activeModule = 'seo', onModuleChange, isLoading = false }: SearchCardProps) {
  const [keyword, setKeyword] = useState('');
  const [searchProvider, setSearchProvider] = useState('duckduckgo'); // По умолчанию DuckDuckGo (работает без ключей)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !city || activeModule !== 'seo' || isLoading) return;
    onSubmit(keyword.trim(), searchProvider);
  };

  const isDisabled = !keyword.trim() || !city || activeModule !== 'seo' || isLoading;

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[SearchCard] provider=%s query=%s city=%s isDisabled=%s', searchProvider, keyword.trim(), city, isDisabled);
    }
  }, [searchProvider, keyword, city, isDisabled]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-[12px] border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Tabs Header */}
      <div className="flex gap-2 px-4 pt-3 pb-0 border-b border-gray-200 dark:border-gray-700 flex-wrap">
        <button
          type="button"
          className={cn(
            'flex items-center h-8 px-2.5 rounded-[10px] text-sm font-medium transition-colors',
            activeModule === 'seo'
              ? 'bg-saas-primary-weak text-saas-primary'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          )}
          onClick={() => onModuleChange?.('seo')}
        >
          SEO
        </button>
        <button type="button" className="flex items-center h-8 px-2.5 rounded-[10px] text-sm font-medium opacity-50 cursor-not-allowed text-gray-500 dark:text-gray-400" disabled>
          Контакты
          <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-[6px]">Скоро</span>
        </button>
        <button type="button" className="flex items-center h-8 px-2.5 rounded-[10px] text-sm font-medium opacity-50 cursor-not-allowed text-gray-500 dark:text-gray-400" disabled>
          <span className="whitespace-nowrap">Мониторинг цен</span>
          <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-[6px]">Скоро</span>
        </button>
      </div>

      {/* Search Form Content */}
      <div className="p-4 md:p-5">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Поисковая система:</span>
            <Select value={searchProvider} onChange={(e) => setSearchProvider(e.target.value)} disabled={isLoading} className="w-[200px] flex-shrink-0">
              <option value="duckduckgo">DuckDuckGo (бесплатно)</option>
              <option value="yandex_html">Яндекс HTML (бесплатно)</option>
              <option value="google_html">Google HTML (бесплатно)</option>
              <option value="yandex_xml">Яндекс XML (требует ключи)</option>
              <option value="serpapi" disabled>SerpAPI (deprecated)</option>
            </Select>
          </div>
          <Input type="text" placeholder="Введите ключевое слово..." value={keyword} onChange={(e) => setKeyword(e.target.value)} disabled={isLoading} className="flex-1 min-w-[200px]" />
          <Select value={city} onChange={(e) => onCityChange(e.target.value)} disabled={isLoading} className="w-[180px] flex-shrink-0">
            <option value="">Выберите город</option>
            {RUSSIAN_CITIES.map(cityName => (
              <option key={cityName} value={cityName}>{cityName}</option>
            ))}
          </Select>
          <Button type="submit" variant="default" disabled={isDisabled} className="flex-shrink-0">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span className="hidden sm:inline">Поиск…</span>
                <span className="sm:hidden">Поиск…</span>
              </>
            ) : (
              'Найти'
            )}
          </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
