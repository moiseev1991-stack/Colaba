'use client';

/**
 * Панель фильтров для списка компаний поиска.
 *
 * Контролы реализованы без shadcn (его в проекте нет) — нативные input/select.
 * 3 пресета внизу — быстрые сценарии «Кризис репутации», «Падение рейтинга»,
 * «Стабильный».
 */

import { useEffect, useState } from 'react';

import { PainTagsCloud } from '@/components/maps/PainTagsCloud';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MapSearchFilter, SortBy } from '@/src/services/api/maps';

type Preset = {
  id: string;
  label: string;
  description: string;
  filter: MapSearchFilter;
};

const PRESETS: Preset[] = [
  {
    id: 'crisis',
    label: 'Кризис репутации',
    description:
      'Для SMM-агентств и репутационщиков: много негатива, владелец не отвечает — компания «горит», ей нужно «спасти лицо»',
    filter: { min_negative: 10, has_owner_replies: false, sort_by: 'negative_desc' },
  },
  {
    id: 'falling',
    label: 'Падение рейтинга',
    description:
      'Для SMM/SERM: низкий рейтинг при достаточном числе отзывов — компания недавно «просела»',
    filter: { max_rating: 3.5, min_reviews: 10, sort_by: 'rating_asc' },
  },
  {
    id: 'need_website',
    label: 'Нужен сайт',
    description:
      'Для веб-студий и фрилансеров: компания живая (рейтинг ≥ 3.5, есть отзывы) — но сайта нет',
    filter: { has_website: false, min_rating: 3.5, min_reviews: 5, sort_by: 'reviews_desc' },
  },
  {
    id: 'chaos',
    label: 'Хаос в работе',
    description:
      'Для CRM/POS-вендоров и автоматизаторов: клиенты в отзывах жалуются на «долгое» (ожидание, ответ, доставку) — компании нужна автоматизация процессов',
    filter: { review_text_contains: 'долго', sort_by: 'negative_desc' },
  },
  {
    id: 'stable',
    label: 'Стабильный',
    description: 'Высокий рейтинг, владелец отвечает — потенциально лояльные клиенты для cross-sell',
    filter: { min_rating: 4.3, min_reviews: 20, has_owner_replies: true, sort_by: 'rating_desc' },
  },
];

interface Props {
  niche: string;
  city: string;
  searchId?: number;
  value: MapSearchFilter;
  onChange: (v: MapSearchFilter) => void;
}

export function MapsFiltersPanel({ niche, city, searchId, value, onChange }: Props) {
  // локальный state для текстовых полей — чтобы при наборе цифр не дёргать debounce каждый ключевой удар
  const [localMinRating, setLocalMinRating] = useState<string>(value.min_rating?.toString() ?? '');
  const [localMaxRating, setLocalMaxRating] = useState<string>(value.max_rating?.toString() ?? '');
  const [localMinReviews, setLocalMinReviews] = useState<string>(value.min_reviews?.toString() ?? '');
  const [localMinNegative, setLocalMinNegative] = useState<string>(value.min_negative?.toString() ?? '');

  // При внешнем изменении value (например, клик по пресету) — синкаем локальные
  useEffect(() => {
    setLocalMinRating(value.min_rating?.toString() ?? '');
    setLocalMaxRating(value.max_rating?.toString() ?? '');
    setLocalMinReviews(value.min_reviews?.toString() ?? '');
    setLocalMinNegative(value.min_negative?.toString() ?? '');
  }, [value]);

  function parseNum(s: string): number | null {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function commit() {
    onChange({
      ...value,
      min_rating: parseNum(localMinRating),
      max_rating: parseNum(localMaxRating),
      min_reviews: parseNum(localMinReviews) as number | null,
      min_negative: parseNum(localMinNegative) as number | null,
    });
  }

  function applyPreset(p: Preset) {
    // Пресет полностью заменяет фильтр, сохраняя только pain_tag_ids
    onChange({ ...p.filter, pain_tag_ids: value.pain_tag_ids });
  }

  return (
    <aside className="space-y-5 rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.description}
            className={cn(
              'rounded-md border px-3 py-2 text-xs font-medium transition-colors',
              'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Рейтинг</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={5}
            step={0.1}
            placeholder="от"
            value={localMinRating}
            onChange={(e) => setLocalMinRating(e.target.value)}
            onBlur={commit}
          />
          <span className="text-slate-400">—</span>
          <Input
            type="number"
            min={0}
            max={5}
            step={0.1}
            placeholder="до"
            value={localMaxRating}
            onChange={(e) => setLocalMaxRating(e.target.value)}
            onBlur={commit}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Минимум отзывов
          </label>
          <Input
            type="number"
            min={0}
            step={1}
            placeholder="0"
            value={localMinReviews}
            onChange={(e) => setLocalMinReviews(e.target.value)}
            onBlur={commit}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Негативных от
          </label>
          <Input
            type="number"
            min={0}
            step={1}
            placeholder="0"
            value={localMinNegative}
            onChange={(e) => setLocalMinNegative(e.target.value)}
            onBlur={commit}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Ответы владельца
        </label>
        <Select
          value={
            value.has_owner_replies === true
              ? 'yes'
              : value.has_owner_replies === false
                ? 'no'
                : 'any'
          }
          onChange={(e) => {
            const v = e.target.value;
            onChange({
              ...value,
              has_owner_replies: v === 'yes' ? true : v === 'no' ? false : null,
            });
          }}
        >
          <option value="any">Не важно</option>
          <option value="yes">Только с ответами</option>
          <option value="no">Только без ответов</option>
        </Select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Сайт
        </label>
        <Select
          value={
            value.has_website === true
              ? 'yes'
              : value.has_website === false
                ? 'no'
                : 'any'
          }
          onChange={(e) => {
            const v = e.target.value;
            onChange({
              ...value,
              has_website: v === 'yes' ? true : v === 'no' ? false : null,
            });
          }}
        >
          <option value="any">Не важно</option>
          <option value="yes">Только с сайтом</option>
          <option value="no">Только без сайта</option>
        </Select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Сортировка</label>
        <Select
          value={value.sort_by ?? 'rating_desc'}
          onChange={(e) => onChange({ ...value, sort_by: e.target.value as SortBy })}
        >
          <option value="rating_desc">Рейтинг ↓</option>
          <option value="rating_asc">Рейтинг ↑</option>
          <option value="reviews_desc">Больше отзывов</option>
          <option value="negative_desc">Больше негатива</option>
          <option value="pain_desc">По упоминаниям болей</option>
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-slate-600">
          Боли клиентов (AI-теги)
        </label>
        <PainTagsCloud
          niche={niche}
          city={city}
          searchId={searchId}
          value={value.pain_tag_ids ?? []}
          onChange={(ids) =>
            onChange({ ...value, pain_tag_ids: ids.length ? ids : null })
          }
        />
      </div>
    </aside>
  );
}
