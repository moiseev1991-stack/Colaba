'use client';

/**
 * Облако тегов болей. Кликабельные бейджи (multi-select).
 *
 * Источник тегов: либо общие по нише (listPainTags), либо теги конкретного
 * поиска (getSearchPainTags). Если searchId передан — берёт из поиска,
 * иначе — из ниши.
 */

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  getSearchPainTags,
  listPainTags,
  type PainTagOut,
} from '@/src/services/api/maps';

interface Props {
  niche: string;
  city?: string;
  searchId?: number;
  value: number[];
  onChange: (ids: number[]) => void;
}

export function PainTagsCloud({ niche, city, searchId, value, onChange }: Props) {
  const [tags, setTags] = useState<PainTagOut[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    const fetcher = searchId ? () => getSearchPainTags(searchId) : () => listPainTags(niche, city);
    fetcher()
      .then((data) => {
        if (mounted) setTags(data);
      })
      .catch(() => {
        if (mounted) setTags([]);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [niche, city, searchId]);

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">Загружаем теги болей…</p>;
  }
  if (tags.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        AI-теги ещё не созданы для этой ниши. Они появятся после того, как накопится
        достаточно отзывов и пройдёт ночной recluster.
      </p>
    );
  }

  // 2026-06-12 компактнее: rounded-md вместо rounded-full, меньше padding,
  // text-[11.5px] — иначе в узкой боковой панели «Спорные доплаты за лечение»
  // занимает три-четыре строки и выглядит огромным «зубчиком». В одну
  // строку влезают 1-2 тега, поэтому делаем плотнее.
  return (
    <div className="flex flex-wrap gap-1">
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-700/50 dark:bg-slate-900 dark:text-rose-300"
          title="Снять все выбранные теги"
        >
          × сбросить
        </button>
      )}
      {tags.map((t) => {
        const selected = value.includes(t.id);
        // 2026-06-21: красим по sentiment. Negative — красным (боль),
        // positive — зелёным (сильная сторона). Default неизвестен
        // (старые теги без sentiment) → красный, как было исторически.
        const positive = t.sentiment === 'positive';
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => toggle(t.id)}
            title={t.description ?? undefined}
            className={cn(
              'cursor-pointer rounded-md border px-2 py-0.5 text-[11.5px] font-medium leading-snug transition-colors',
              selected
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : positive
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-500 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:border-emerald-500'
                  : 'border-rose-300 bg-rose-50 text-rose-800 hover:border-rose-500 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200 dark:hover:border-rose-500',
            )}
          >
            {t.label}
            <span
              className={cn(
                'ml-1 text-[10px] font-normal',
                selected
                  ? 'text-slate-300 dark:text-slate-500'
                  : positive
                    ? 'text-emerald-700/80 dark:text-emerald-300/80'
                    : 'text-rose-700/80 dark:text-rose-300/80',
              )}
            >
              {t.occurrences_count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
