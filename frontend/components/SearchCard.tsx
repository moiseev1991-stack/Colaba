'use client';

import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { cn } from '@/lib/utils';

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
  onSubmit: (keyword: string) => void;
  activeModule?: 'seo' | 'contacts' | 'prices';
  onModuleChange?: (module: 'seo' | 'contacts' | 'prices') => void;
}

export function SearchCard({ city, onCityChange, onSubmit, activeModule = 'seo', onModuleChange }: SearchCardProps) {
  const [keyword, setKeyword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !city || activeModule !== 'seo') return;
    onSubmit(keyword.trim());
  };

  const isDisabled = !keyword.trim() || !city || activeModule !== 'seo';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Browser-style Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-2 pt-2">
        {/* SEO Tab */}
        <button
          type="button"
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-all relative -mb-px z-10',
            activeModule === 'seo'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-t border-l border-r border-gray-200 dark:border-gray-700 rounded-t-lg border-b-2 border-b-transparent'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          )}
          onClick={() => onModuleChange?.('seo')}
        >
          SEO
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
          <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">Скоро</span>
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
          Мониторинг цен
          <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">Скоро</span>
        </button>
      </div>

      {/* Search Form Content */}
      <div className="p-6">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-4 flex-wrap">
          {/* Engine Badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Поисковая система:
            </span>
            <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm font-medium whitespace-nowrap">
              Яндекс
            </span>
          </div>

          {/* Keyword Input */}
          <Input
            type="text"
            placeholder="Введите ключевое слово..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="flex-1 min-w-[250px] h-12"
          />

          {/* City Select */}
          <Select
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
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
            Найти
          </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
