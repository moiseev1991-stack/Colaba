'use client';

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

const SEARCH_ENGINES = [
  { value: 'yandex', label: 'Яндекс' },
  { value: 'google', label: 'Google' },
];

interface SearchControlsProps {
  city: string;
  engine: string;
  onCityChange: (city: string) => void;
  onEngineChange: (engine: string) => void;
}

export function SearchControls({ city, engine, onCityChange, onEngineChange }: SearchControlsProps) {
  return (
    <div className="flex items-center gap-3 mb-8 flex-nowrap -ml-1">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">Поисковая система:</span>
        <Select
          value={engine}
          onChange={(e) => onEngineChange(e.target.value)}
          className="min-w-[140px] flex-shrink-0"
        >
          {SEARCH_ENGINES.map(eng => (
            <option key={eng.value} value={eng.value}>
              {eng.label}
            </option>
          ))}
        </Select>
      </div>
      
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">Город (Россия):</span>
        <Select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          className="min-w-[220px] flex-shrink-0"
        >
          <option value="">
            Выберите город
          </option>
          {RUSSIAN_CITIES.map(cityName => (
            <option key={cityName} value={cityName}>
              {cityName}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
