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

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => {
        const selected = value.includes(t.id);
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => toggle(t.id)}
            title={t.description ?? undefined}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selected
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
            )}
          >
            {t.label} · {t.occurrences_count}
          </button>
        );
      })}
    </div>
  );
}
