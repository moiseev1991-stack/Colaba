'use client';

import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { ProcessStepsIndicator } from './ProcessStepsIndicator';

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
  const [searchProvider, setSearchProvider] = useState('duckduckgo'); // По умолчанию DuckDuckGo (бесплатный)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !city || activeModule !== 'seo' || isLoading) return;
    onSubmit(keyword.trim(), searchProvider);
  };

  const isDisabled = !keyword.trim() || !city || activeModule !== 'seo' || isLoading;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Tabs Header - Segmented/Pill Style */}
      <div className="flex gap-1 px-4 pt-4 pb-0 border-b border-gray-200 dark:border-gray-700 flex-wrap">
        {/* SEO Tab */}
        <button
          type="button"
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-all relative',
            activeModule === 'seo'
              ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50/50 dark:hover:bg-gray-700/30'
          )}
          onClick={() => onModuleChange?.('seo')}
        >
          <span className="relative inline-block">
            SEO
            {activeModule === 'seo' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 dark:bg-red-500 -mb-2.5 rounded-full" />
            )}
          </span>
        </button>

        {/* Contacts Tab */}
        <button
          type="button"
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-all opacity-50 cursor-not-allowed',
            'text-gray-500 dark:text-gray-400'
          )}
          disabled
        >
          Контакты
          <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">Скоро</span>
        </button>

        {/* Price Monitoring Tab */}
        <button
          type="button"
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-all opacity-50 cursor-not-allowed',
            'text-gray-500 dark:text-gray-400'
          )}
          disabled
        >
          <span className="whitespace-nowrap">
            Мониторинг цен
            <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">Скоро</span>
          </span>
        </button>
      </div>

      {/* Search Form Content */}
      <div className="p-6">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-4 flex-wrap">
          {/* Search Provider Select */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Поисковая система:
            </span>
            <Select
              value={searchProvider}
              onChange={(e) => setSearchProvider(e.target.value)}
              disabled={isLoading}
              className="w-[200px] h-12 flex-shrink-0"
            >
              <option value="duckduckgo">DuckDuckGo (бесплатно)</option>
              <option value="yandex_html">Яндекс HTML (бесплатно)</option>
              <option value="google_html">Google HTML (бесплатно)</option>
              <option value="yandex_xml">Яндекс XML (требует ключи)</option>
              <option value="serpapi">SerpAPI (deprecated)</option>
            </Select>
          </div>

          {/* Keyword Input */}
          <Input
            type="text"
            placeholder="Введите ключевое слово..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            disabled={isLoading}
            className="flex-1 min-w-[250px] h-12"
          />

          {/* City Select */}
          <Select
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            disabled={isLoading}
            className="w-[190px] h-12 flex-shrink-0"
          >
            <option value="">Выберите город</option>
            {RUSSIAN_CITIES.map(cityName => (
              <option key={cityName} value={cityName}>
                {cityName}
              </option>
            ))}
          </Select>

          {/* Submit Button */}
          <Button 
            type="submit" 
            variant="default" 
            disabled={isDisabled}
            className="h-12 px-6 flex-shrink-0"
          >
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
        
        {/* Loading Indicator - Process Steps */}
        {isLoading && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <ProcessStepsIndicator />
          </div>
        )}
      </div>
    </div>
  );
}
