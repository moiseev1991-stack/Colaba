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
  /** Полное описание — показывается в tooltip при наведении. */
  description: string;
  /** Короткая видимая подпись под названием — для быстрого скана глазами. */
  shortHint: string;
  filter: MapSearchFilter;
};

const PRESETS: Preset[] = [
  {
    id: 'crisis',
    label: 'Кризис репутации',
    shortHint: 'для SMM / репутационщиков',
    description:
      'Для SMM-агентств и репутационщиков: много негатива, владелец не отвечает — компания «горит», ей нужно «спасти лицо»',
    filter: { min_negative: 10, has_owner_replies: false, sort_by: 'negative_desc' },
  },
  {
    id: 'falling',
    label: 'Падение рейтинга',
    shortHint: 'для SMM / SERM',
    description:
      'Для SMM/SERM: низкий рейтинг при достаточном числе отзывов — компания недавно «просела»',
    filter: { max_rating: 3.5, min_reviews: 10, sort_by: 'rating_asc' },
  },
  {
    id: 'need_website',
    label: 'Нужен сайт',
    shortHint: 'для веб-студий',
    description:
      'Для веб-студий и фрилансеров: компания живая (рейтинг ≥ 3.5, есть отзывы) — но сайта нет',
    filter: { has_website: false, min_rating: 3.5, min_reviews: 5, sort_by: 'reviews_desc' },
  },
  {
    id: 'chaos',
    label: 'Хаос в работе',
    shortHint: 'для CRM / автоматизаторов',
    description:
      'Для CRM/POS-вендоров и автоматизаторов: клиенты в отзывах жалуются на сбои процессов — «не дозвонился», «не перезвонили», «забыли про запись», «не подтвердили». Сигнал «нужна автоматизация».',
    filter: {
      review_text_contains_any: [
        'не дозвон',
        'не перезвон',
        'не ответ',
        'забыли',
        'не подтвердил',
        'не пришл',
      ],
      min_negative: 3,
      sort_by: 'negative_desc',
    },
  },
  {
    id: 'stable',
    label: 'Стабильный',
    shortHint: 'для cross-sell / upsell',
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
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.description}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
              'border-slate-300 bg-white hover:border-slate-500 hover:bg-slate-50'
            )}
          >
            <span className="text-xs font-medium text-slate-800">{p.label}</span>
            <span className="text-[10px] leading-tight text-slate-500">{p.shortHint}</span>
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

      {(value.review_text_contains_any?.length ||
        value.review_text_excludes_any?.length ||
        value.review_text_contains ||
        value.review_text_excludes) && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-700">
            Слова в отзывах
          </div>
          {(value.review_text_contains_any?.length || value.review_text_contains) && (
            <div className="mb-1 text-[12px] text-slate-700">
              <span className="text-amber-700">содержит:</span>{' '}
              {[
                value.review_text_contains,
                ...(value.review_text_contains_any ?? []),
              ]
                .filter(Boolean)
                .map((w) => `«${w}»`)
                .join(' / ')}
            </div>
          )}
          {(value.review_text_excludes_any?.length || value.review_text_excludes) && (
            <div className="mb-1 text-[12px] text-slate-700">
              <span className="text-amber-700">не содержит:</span>{' '}
              {[
                value.review_text_excludes,
                ...(value.review_text_excludes_any ?? []),
              ]
                .filter(Boolean)
                .map((w) => `«${w}»`)
                .join(' / ')}
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                review_text_contains: null,
                review_text_excludes: null,
                review_text_contains_any: null,
                review_text_excludes_any: null,
              })
            }
            className="mt-1 text-[11px] text-amber-700 underline hover:text-amber-900"
          >
            убрать
          </button>
        </div>
      )}

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
