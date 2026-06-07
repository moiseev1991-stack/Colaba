/**
 * Multi-preset AND — слияние нескольких пресетов фильтров логическим И.
 *
 * Каждое поле пресета прибавляется к итоговому фильтру так, чтобы выдача
 * сужалась (AND). Конкретные правила слияния:
 *
 *   min_*  (rating, reviews, negative, revenue, age_years) — MAX (строже)
 *   max_*  (rating)                                        — MIN  (строже)
 *   массивы (contains_any, excludes_any, pain_tag_ids)     — UNION (any)
 *   has_website / has_owner_replies                        — первый выбранный
 *      (если конфликт — оставляем самый ранний, конфликт обозначен в UI)
 *   sort_by                                                — первый выбранный
 *   source_filter                                          — первый выбранный
 *   review_text_contains (single, legacy)                  — игнор, используем _any
 *
 * Manual-правки (ввод юзера в input'ах) применяются ПОВЕРХ merged-пресетов —
 * это позволяет тонко донастроить фильтр после выбора пресетов.
 */

import type { MapSearchFilter, SortBy } from '@/src/services/api/maps';

const MIN_KEYS = [
  'min_rating',
  'min_reviews',
  'min_negative',
  'min_revenue',
  'min_age_years',
] as const;

const MAX_KEYS = ['max_rating'] as const;

const ARRAY_UNION_KEYS = [
  'review_text_contains_any',
  'review_text_excludes_any',
  'pain_tag_ids',
] as const;

const BOOL_KEYS = ['has_website', 'has_owner_replies'] as const;

const FIRST_WINS_KEYS = ['sort_by', 'source_filter'] as const;

type PresetLike = { filter: Partial<MapSearchFilter> };

export function mergePresetsAND(
  presets: PresetLike[],
): Partial<MapSearchFilter> {
  const out: Record<string, unknown> = {};

  for (const p of presets) {
    const f = (p.filter ?? {}) as Record<string, unknown>;

    for (const k of MIN_KEYS) {
      const v = f[k];
      if (typeof v === 'number') {
        const cur = out[k];
        out[k] = typeof cur === 'number' ? Math.max(cur, v) : v;
      }
    }
    for (const k of MAX_KEYS) {
      const v = f[k];
      if (typeof v === 'number') {
        const cur = out[k];
        out[k] = typeof cur === 'number' ? Math.min(cur, v) : v;
      }
    }
    for (const k of ARRAY_UNION_KEYS) {
      const v = f[k];
      if (Array.isArray(v) && v.length > 0) {
        const cur = (out[k] as unknown[] | undefined) ?? [];
        out[k] = Array.from(new Set([...cur, ...v]));
      }
    }
    for (const k of BOOL_KEYS) {
      if (typeof f[k] === 'boolean' && out[k] === undefined) {
        out[k] = f[k];
      }
    }
    for (const k of FIRST_WINS_KEYS) {
      if (f[k] != null && out[k] === undefined) {
        out[k] = f[k];
      }
    }
  }

  return out as Partial<MapSearchFilter>;
}

/** Признаки конфликта между набором пресетов — для предупреждения юзеру.
 *  Конфликт = одно и то же поле задано двумя пресетами с разными значениями
 *  и поле не подлежит «строгому» AND-мерджу (boolean / sort_by). */
export function findPresetConflicts(presets: PresetLike[]): {
  field: string;
  values: unknown[];
}[] {
  const conflicts: { field: string; values: unknown[] }[] = [];

  for (const k of [...BOOL_KEYS, ...FIRST_WINS_KEYS]) {
    const values: unknown[] = [];
    for (const p of presets) {
      const v = (p.filter as Record<string, unknown>)[k];
      if (v != null && !values.includes(v)) values.push(v);
    }
    if (values.length > 1) {
      conflicts.push({ field: k, values });
    }
  }

  return conflicts;
}

/** Применяет к merged пресетам manual-overrides (то, что юзер ввёл в input'ах
 *  ПОСЛЕ применения пресетов). Только не-null значения override-ят пресет. */
export function applyManualOverrides(
  base: Partial<MapSearchFilter>,
  manual: Partial<MapSearchFilter>,
): MapSearchFilter {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(manual)) {
    if (v !== null && v !== undefined) {
      out[k] = v;
    }
  }
  // sort_by по умолчанию — 'rating_desc'
  if (out.sort_by == null) out.sort_by = 'rating_desc' satisfies SortBy;
  return out as MapSearchFilter;
}

/** Поля, по которым находим разногласия в boolean (например один пресет
 *  has_website=true, другой has_website=false). Юзер видит warning. */
export function humanFieldLabel(field: string): string {
  switch (field) {
    case 'has_website':
      return 'Наличие сайта';
    case 'has_owner_replies':
      return 'Ответы владельца';
    case 'sort_by':
      return 'Сортировка';
    case 'source_filter':
      return 'Источник';
    default:
      return field;
  }
}
