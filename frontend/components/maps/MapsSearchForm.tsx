'use client';

/**
 * Форма создания поиска по картам.
 *
 * Минимум: ниша + город + выбор источников (2GIS / Яндекс.Карты).
 * NICHE_PRESETS — клик заполняет поле; источники — две галочки.
 * После submit вызывает createMapSearch и передаёт результат родителю.
 */

import { useState } from 'react';

import { CityCombobox } from '@/components/CityCombobox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createMapSearch, type MapSearchOut, type MapSource } from '@/src/services/api/maps';

const NICHE_PRESETS = [
  'стоматология',
  'автосервис',
  'ремонт квартир',
  'юридические услуги',
  'бухгалтерские услуги',
  'клининговая компания',
  'фитнес клуб',
  'доставка еды',
  'рекламное агентство',
  'строительные компании',
];

interface Props {
  onStarted: (search: MapSearchOut) => void;
}

export function MapsSearchForm({ onStarted }: Props) {
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('Москва');
  const [sources, setSources] = useState<MapSource[]>(['2gis']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSource(s: MapSource) {
    setSources((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (niche.trim().length < 2) {
      setError('Ниша слишком короткая');
      return;
    }
    if (sources.length === 0) {
      setError('Выбери хотя бы один источник');
      return;
    }
    setIsLoading(true);
    try {
      const search = await createMapSearch({
        niche: niche.trim(),
        city: city.trim() || 'Москва',
        sources,
      });
      onStarted(search);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Не удалось создать поиск');
    } finally {
      setIsLoading(false);
    }
  }

  const isReady = niche.trim().length >= 2 && sources.length > 0;

  return (
    <div className="mx-auto max-w-2xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Поиск по картам</h1>
        <p className="mt-1 text-sm text-slate-500">
          Введите нишу и город — модуль найдёт компании в 2GIS / Яндекс.Картах,
          подтянет отзывы и выделит «боли» клиентов.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Ниша / запрос</label>
          <Input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="например, стоматология"
            autoFocus
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {NICHE_PRESETS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setNiche(p)}
                className={cn(
                  'app-badge app-badge-accent cursor-pointer transition-opacity',
                  niche === p ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Город</label>
          <CityCombobox city={city} onCityChange={(c) => setCity(c)} />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Источники</label>
          <div className="flex flex-wrap gap-3">
            {(
              [
                { id: '2gis' as MapSource, name: '2GIS' },
                { id: 'yandex_maps' as MapSource, name: 'Яндекс.Карты' },
              ]
            ).map((s) => (
              <label
                key={s.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  sources.includes(s.id)
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-400'
                )}
              >
                <input
                  type="checkbox"
                  checked={sources.includes(s.id)}
                  onChange={() => toggleSource(s.id)}
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors',
              isReady && !isLoading
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-slate-300 cursor-not-allowed'
            )}
          >
            {isLoading ? 'Запускаем…' : 'Найти'}
          </button>
          {!isReady && !isLoading && (
            <span className="text-xs text-slate-500">
              {niche.trim().length < 2 ? 'Введите нишу (минимум 2 символа)' : 'Выберите хотя бы один источник'}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
