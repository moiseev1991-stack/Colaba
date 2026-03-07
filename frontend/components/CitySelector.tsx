'use client';

import { useState, useEffect } from 'react';
import { Select } from './ui/select';
import { REGIONS, findRegionByCity, DEFAULT_REGION_ID } from '@/lib/cities';

interface CitySelectorProps {
  city: string;
  onCityChange: (city: string) => void;
  disabled?: boolean;
  regionClassName?: string;
  cityClassName?: string;
}

export function CitySelector({
  city,
  onCityChange,
  disabled = false,
  regionClassName = 'w-[200px]',
  cityClassName = 'w-[180px]',
}: CitySelectorProps) {
  const [regionId, setRegionId] = useState<string>(() => {
    if (city) {
      return findRegionByCity(city)?.id ?? DEFAULT_REGION_ID;
    }
    return DEFAULT_REGION_ID;
  });

  // Sync regionId when city prop changes externally (e.g. on reset)
  useEffect(() => {
    if (city) {
      const found = findRegionByCity(city);
      if (found) setRegionId(found.id);
    } else {
      setRegionId(DEFAULT_REGION_ID);
    }
  }, [city]);

  const selectedRegion = REGIONS.find((r) => r.id === regionId) ?? null;
  const showCitySelect = selectedRegion !== null && selectedRegion.cities.length > 1;

  const handleRegionChange = (newRegionId: string) => {
    setRegionId(newRegionId);
    const region = REGIONS.find((r) => r.id === newRegionId);
    if (!region) return;
    if (region.cities.length === 1) {
      // Single city in region — select it automatically
      onCityChange(region.cities[0]);
    } else {
      // Multiple cities — reset city selection
      onCityChange('');
    }
  };

  const handleCityChange = (newCity: string) => {
    onCityChange(newCity);
  };

  return (
    <>
      <Select
        value={regionId}
        onChange={(e) => handleRegionChange(e.target.value)}
        disabled={disabled}
        className={regionClassName}
      >
        <option value="">Выберите регион</option>
        {REGIONS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>

      {showCitySelect && (
        <Select
          value={city}
          onChange={(e) => handleCityChange(e.target.value)}
          disabled={disabled}
          className={cityClassName}
        >
          <option value="">Выберите город</option>
          {selectedRegion.cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      )}
    </>
  );
}
