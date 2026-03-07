'use client';

import { Select } from './ui/select';
import { CityCombobox } from './CityCombobox';

const SEARCH_ENGINES = [
  { value: 'yandex', label: 'Яндекс' },
  { value: 'google', label: 'Google' },
];

interface SearchControlsProps {
  city: string;
  engine: string;
  onCityChange: (city: string, yandexId?: number) => void;
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
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">Город:</span>
        <CityCombobox
          city={city}
          onCityChange={onCityChange}
          className="min-w-[220px] flex-shrink-0"
        />
      </div>
    </div>
  );
}
