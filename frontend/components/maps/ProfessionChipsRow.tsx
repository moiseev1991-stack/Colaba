'use client';

/**
 * ProfessionChipsRow — chip-row «по профессии» над выдачей карт.
 *
 * Эпик C фокус-релиза «КП-конвейер» (ТЗ 2026-06-12). Один из 3 chip'ов
 * выбирается на онбординге (Эпик B) и автоматически активируется при
 * первом открытии выдачи. Юзер может переключаться или сбросить.
 *
 * Логика применения:
 *  - Click активного chip — снимает фильтры (state → null).
 *  - Click неактивного chip — сначала зачищает все профессиональные
 *    поля (PROFESSION_PRESET_FIELDS), потом подставляет поля
 *    выбранного пресета.
 *  - Кнопка «Сбросить» — снимает текущий chip.
 *
 * Активность чек: chip активен если ВСЕ его поля совпадают с текущим
 * filter (см. isChipActive). Так юзер видит правильную подсветку даже
 * после ручной правки в сайдбаре (если она «откатила» chip — он
 * перестаёт быть активным сам по себе).
 */

import { Briefcase, RotateCcw, Search, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import {
  PROFESSION_PRESETS,
  PROFESSION_PRESET_FIELDS,
  type ProfessionPreset,
  type ProfessionPresetKey,
} from '@/components/maps/professionPresets';
import type { MapSearchFilter } from '@/src/services/api/maps';

const ICONS: Record<ProfessionPresetKey, ReactNode> = {
  for_webstudio: <Wrench className="h-3.5 w-3.5" />,
  for_seo: <Search className="h-3.5 w-3.5" />,
  for_marketing: <Briefcase className="h-3.5 w-3.5" />,
};

interface Props {
  filter: MapSearchFilter;
  onChange: (next: MapSearchFilter) => void;
}

function isChipActive(filter: MapSearchFilter, preset: ProfessionPreset): boolean {
  for (const [k, v] of Object.entries(preset.filter)) {
    if ((filter as any)[k] !== v) return false;
  }
  return true;
}

function clearProfessionFields(filter: MapSearchFilter): MapSearchFilter {
  const next: any = { ...filter };
  for (const k of PROFESSION_PRESET_FIELDS) {
    next[k] = null;
  }
  return next;
}

export function ProfessionChipsRow({ filter, onChange }: Props) {
  const activeKey: ProfessionPresetKey | null =
    PROFESSION_PRESETS.find((p) => isChipActive(filter, p))?.key ?? null;

  function toggle(preset: ProfessionPreset) {
    if (activeKey === preset.key) {
      onChange(clearProfessionFields(filter));
      return;
    }
    const cleared = clearProfessionFields(filter);
    onChange({ ...cleared, ...preset.filter });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800/40">
      <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Под профессию
      </span>
      {PROFESSION_PRESETS.map((p) => {
        const active = activeKey === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => toggle(p)}
            title={p.hint}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors',
              active
                ? 'bg-violet-600 text-white shadow-sm hover:bg-violet-700'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50 hover:text-violet-700 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-violet-900/30 dark:hover:text-violet-200',
            )}
          >
            {ICONS[p.key]}
            {p.label}
          </button>
        );
      })}
      {activeKey != null && (
        <button
          type="button"
          onClick={() => onChange(clearProfessionFields(filter))}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-700/50 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-900/20"
          title="Снять профессиональный фильтр"
        >
          <RotateCcw className="h-3 w-3" />
          Сбросить
        </button>
      )}
    </div>
  );
}
