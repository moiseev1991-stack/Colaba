'use client';

import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select } from './ui/select';

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
}

export function SearchCard({ city, onCityChange, onSubmit }: SearchCardProps) {
  const [keyword, setKeyword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !city) return;
    onSubmit(keyword.trim());
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
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
            className="flex-1 min-w-[200px] h-12"
          />

          {/* City Select */}
          <Select
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            className="w-[280px] h-12 flex-shrink-0"
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
            disabled={!keyword.trim() || !city}
            className="h-12 px-6 flex-shrink-0"
          >
            Найти
          </Button>
        </div>
      </form>
    </div>
  );
}
