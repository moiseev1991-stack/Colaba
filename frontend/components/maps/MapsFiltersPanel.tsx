'use client';

/**
 * Панель фильтров для списка компаний поиска.
 *
 * Контролы реализованы без shadcn (его в проекте нет) — нативные input/select.
 * Готовые пресеты ниже — см. BUILTIN_PRESETS (источник истины).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Eraser, EyeOff, RotateCcw, X } from 'lucide-react';

import { BUILTIN_PRESETS, type BuiltinPreset } from '@/components/maps/builtinPresets';
import {
  findPresetConflicts,
  humanFieldLabel,
  mergePresetsAND,
} from '@/components/maps/multiPresetMerge';
import { PainTagsCloud } from '@/components/maps/PainTagsCloud';
import { SaveFilterPresetModal } from '@/components/maps/SaveFilterPresetModal';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MapSearchFilter, SortBy } from '@/src/services/api/maps';
import {
  deleteUserPreset,
  listUserPresets,
  updateUserPreset,
  type UserPresetOut,
} from '@/src/services/api/user-presets';

// Встроенные пресеты — в общем файле, переиспользуются в MapsSearchForm.
const PRESETS = BUILTIN_PRESETS;
type Preset = BuiltinPreset;

// Лейбл applied-preset chip'а. Резолвит id вида `builtin:foo` / `user:42`.
function labelOfPresetId(
  id: string,
  builtins: BuiltinPreset[],
  userPresets: UserPresetOut[],
): string {
  if (id.startsWith('builtin:')) {
    const presetId = id.slice('builtin:'.length);
    return builtins.find((p) => p.id === presetId)?.label ?? presetId;
  }
  if (id.startsWith('user:')) {
    const presetId = Number(id.slice('user:'.length));
    return userPresets.find((p) => p.id === presetId)?.name ?? `пресет #${presetId}`;
  }
  return id;
}

interface Props {
  niche: string;
  city: string;
  searchId?: number;
  value: MapSearchFilter;
  onChange: (v: MapSearchFilter) => void;
  /** Колбэк при выборе user-пресета с непустым ai_prompt — родитель может
   *  предложить юзеру запустить AI-анализ. */
  onUserPresetWithAiSelected?: (preset: UserPresetOut) => void;
  /** Активен ли AI-анализ (пресет с ai_prompt выбран). Если да — в Select
   *  сортировки показываем дополнительные опции «AI: score ↓/↑». */
  aiActive?: boolean;
}

export function MapsFiltersPanel({
  niche, city, searchId, value, onChange, onUserPresetWithAiSelected, aiActive,
}: Props) {
  // локальный state для текстовых полей — чтобы при наборе цифр не дёргать debounce каждый ключевой удар
  const [localMinRating, setLocalMinRating] = useState<string>(value.min_rating?.toString() ?? '');
  const [localMaxRating, setLocalMaxRating] = useState<string>(value.max_rating?.toString() ?? '');
  const [localMinReviews, setLocalMinReviews] = useState<string>(value.min_reviews?.toString() ?? '');
  const [localMinNegative, setLocalMinNegative] = useState<string>(value.min_negative?.toString() ?? '');
  // Локальный state для слов — храним как строку через запятую (юзер так её видит),
  // парсим на onBlur/Enter.
  const [localContainsWords, setLocalContainsWords] = useState<string>(
    joinWords(value.review_text_contains, value.review_text_contains_any),
  );
  const [localExcludesWords, setLocalExcludesWords] = useState<string>(
    joinWords(value.review_text_excludes, value.review_text_excludes_any),
  );

  // Пользовательские пресеты — две вкладки: активные и скрытые. Грузим все
  // (hidden=null) одним запросом и фильтруем локально, чтобы переключение
  // вкладок было мгновенным без round-trip.
  const [allUserPresets, setAllUserPresets] = useState<UserPresetOut[]>([]);
  const [userPresetsTab, setUserPresetsTab] = useState<'active' | 'hidden'>('active');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  // Подтверждение удаления через свою модалку. window.confirm на проде
  // вешал страницу на 30 секунд (CDP-блокер) — заменили на Dialog.
  const [confirmDelete, setConfirmDelete] = useState<UserPresetOut | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  // Multi-preset AND: список применённых сейчас пресетов в порядке клика.
  // ID = `builtin:${id}` для встроенных, `user:${id}` для пользовательских.
  // Порядок важен — для конфликтных полей (boolean, sort_by) выигрывает
  // первый добавленный.
  const [appliedPresetIds, setAppliedPresetIds] = useState<string[]>([]);
  // Manual-overrides: то что юзер изменил в input'ах/select'ах ПОВЕРХ
  // merged-пресетов. При toggle нового пресета — overrides сохраняются
  // и применяются сверху merged, чтобы ручные правки не терялись.
  const [manualOverrides, setManualOverrides] = useState<
    Partial<MapSearchFilter>
  >({});

  const activeUserPresets = allUserPresets.filter((p) => !p.hidden);
  const hiddenUserPresets = allUserPresets.filter((p) => p.hidden);
  const visibleUserPresets =
    userPresetsTab === 'active' ? activeUserPresets : hiddenUserPresets;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listUserPresets('maps', null); // null = все, и активные и скрытые
        if (!cancelled) setAllUserPresets(list);
      } catch {
        // Если 401 / network — не валим панель, просто работаем без пользовательских пресетов
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDeleteUserPreset = useCallback((preset: UserPresetOut) => {
    // Открываем свою модалку подтверждения — на проде native window.confirm
    // блокировал страницу.
    setConfirmDelete(preset);
  }, []);

  const confirmDeleteNow = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleteInProgress(true);
    try {
      await deleteUserPreset(confirmDelete.id);
      setAllUserPresets((prev) => prev.filter((p) => p.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e) {
      // оставляем модалку открытой, показываем ошибку через alert
      // (можно потом добавить inline-error в самом Dialog)
      window.alert('Не удалось удалить пресет');
    } finally {
      setDeleteInProgress(false);
    }
  }, [confirmDelete]);

  const handleToggleHidden = useCallback(async (preset: UserPresetOut, hidden: boolean) => {
    try {
      const updated = await updateUserPreset(preset.id, { hidden });
      setAllUserPresets((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      window.alert('Не удалось изменить статус пресета');
    }
  }, []);

  const handlePresetSaved = useCallback((preset: UserPresetOut) => {
    setAllUserPresets((prev) => [preset, ...prev]);
    // При сохранении переключаемся на «активные» — чтобы юзер сразу увидел новый.
    setUserPresetsTab('active');
  }, []);

  /** Резолвит applied-preset id в объект с фильтром. Возвращает null если
   *  пресет уже удалён (на случай если user-пресет успели удалить пока
   *  он был в applied). */
  function resolvePreset(
    id: string,
  ): { filter: MapSearchFilter; ai_prompt?: string | null } | null {
    if (id.startsWith('builtin:')) {
      const presetId = id.slice('builtin:'.length);
      const p = PRESETS.find((x) => x.id === presetId);
      return p ? { filter: p.filter, ai_prompt: p.ai_prompt } : null;
    }
    if (id.startsWith('user:')) {
      const presetId = Number(id.slice('user:'.length));
      const p = allUserPresets.find((x) => x.id === presetId);
      return p
        ? { filter: p.filter as MapSearchFilter, ai_prompt: p.ai_prompt }
        : null;
    }
    return null;
  }

  /** Конфликты в выбранных пресетах (показываем юзеру). */
  const presetConflicts = useMemo(() => {
    const resolved = appliedPresetIds
      .map((id) => resolvePreset(id))
      .filter((x): x is { filter: MapSearchFilter } => x !== null);
    return findPresetConflicts(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedPresetIds, allUserPresets]);

  /** Применяет/снимает пресет в наборе. Пересчитывает финальный фильтр:
   *  mergePresetsAND(applied) + manualOverrides сверху + pain_tag_ids. */
  function toggleAppliedId(id: string) {
    setAppliedPresetIds((prev) => {
      const isApplied = prev.includes(id);
      const next = isApplied ? prev.filter((x) => x !== id) : [...prev, id];

      const resolved = next
        .map((presetId) => resolvePreset(presetId))
        .filter((x): x is { filter: MapSearchFilter } => x !== null);
      const merged = mergePresetsAND(resolved);

      // Применяем manual-overrides поверх merged — ручные правки выигрывают.
      const finalFilter: Record<string, unknown> = { ...merged };
      for (const [k, v] of Object.entries(manualOverrides)) {
        if (v !== null && v !== undefined) finalFilter[k] = v;
      }
      // pain_tag_ids ходит сам по себе (управляется через PainTagsCloud).
      finalFilter.pain_tag_ids = value.pain_tag_ids ?? null;
      // sort_by по умолчанию.
      if (finalFilter.sort_by == null) finalFilter.sort_by = 'rating_desc';

      onChange(finalFilter as MapSearchFilter);
      return next;
    });
  }

  /** Записывает override-значение в manualOverrides по факту ручной правки.
   *  Вызывается из commit() / commitWords() / прямых onChange'ей. */
  function recordManualOverride(field: keyof MapSearchFilter, v: unknown) {
    setManualOverrides((prev) => {
      if (v === null || v === undefined) {
        // null = сброс — убираем из overrides, чтобы пресеты могли управлять
        // полем снова.
        if (!(field in prev)) return prev;
        const { [field]: _, ...rest } = prev;
        return rest as Partial<MapSearchFilter>;
      }
      return { ...prev, [field]: v };
    });
  }

  /** Toggle для пользовательских пресетов — теперь через appliedPresetIds. */
  function toggleUserPreset(p: UserPresetOut) {
    if (p.hidden) return; // скрытые не активируем
    const id = `user:${p.id}`;
    const wasApplied = appliedPresetIds.includes(id);
    toggleAppliedId(id);
    // AI-prompt колбэк родителю — только при ВКЛЮЧЕНИИ user-пресета с ai.
    if (!wasApplied && p.ai_prompt && p.ai_prompt.trim()) {
      onUserPresetWithAiSelected?.(p);
    }
  }

  function isUserPresetActive(p: UserPresetOut): boolean {
    return appliedPresetIds.includes(`user:${p.id}`);
  }

  // При внешнем изменении value (например, клик по пресету) — синкаем локальные
  useEffect(() => {
    setLocalMinRating(value.min_rating?.toString() ?? '');
    setLocalMaxRating(value.max_rating?.toString() ?? '');
    setLocalMinReviews(value.min_reviews?.toString() ?? '');
    setLocalMinNegative(value.min_negative?.toString() ?? '');
    setLocalContainsWords(joinWords(value.review_text_contains, value.review_text_contains_any));
    setLocalExcludesWords(joinWords(value.review_text_excludes, value.review_text_excludes_any));
  }, [value]);

  // Debounce-auto-apply для числовых полей. Раньше изменения коммитились
  // только onBlur — юзер набирал «4» в «рейтинг от» и думал что фильтр
  // сломан, пока не кликнет за пределами поля. Теперь — через 500мс
  // тишины поле само применяется. onBlur оставлен как «применить
  // немедленно» (для табуляции в следующее поле).
  const skipNextAutoApply = useRef(true);
  useEffect(() => {
    // Первый прогон после маунта/синка с props — не триггерим (иначе
    // обнулим существующие фильтры при открытии страницы).
    if (skipNextAutoApply.current) {
      skipNextAutoApply.current = false;
      return;
    }
    const t = setTimeout(() => {
      onChange({
        ...value,
        min_rating: parseNum(localMinRating),
        max_rating: parseNum(localMaxRating),
        min_reviews: parseNum(localMinReviews) as number | null,
        min_negative: parseNum(localMinNegative) as number | null,
      });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMinRating, localMaxRating, localMinReviews, localMinNegative]);
  // Сбросить флаг на следующий внешний sync (когда применили пресет или
  // нажали Reset — value меняется снаружи, useEffect выше обновит local-state,
  // и мы не хотим, чтобы auto-apply сразу же написал то же значение обратно).
  useEffect(() => {
    skipNextAutoApply.current = true;
  }, [value]);

  /** Полный сброс всех фильтров к дефолту. Числовые/булевые/массивы → null,
   *  сортировка → rating_desc. Используется по кнопке «Сбросить фильтры».
   *  Также чистит все applied-пресеты и manual-overrides — иначе после
   *  reset нажатие на пресет снова бы накладывало стек. */
  const resetAllFilters = useCallback(() => {
    setAppliedPresetIds([]);
    setManualOverrides({});
    onChange({
      min_rating: null,
      max_rating: null,
      min_reviews: null,
      min_negative: null,
      has_owner_replies: null,
      has_website: null,
      has_lpr: null,
      pain_tag_ids: null,
      sort_by: 'rating_desc',
      review_text_contains: null,
      review_text_excludes: null,
      review_text_contains_any: null,
      review_text_excludes_any: null,
      min_revenue: null,
      min_age_years: null,
      opf_in: null,
      source_filter: 'all',
    });
  }, [onChange]);

  /** Есть ли вообще что сбрасывать — иначе кнопка серая. */
  const hasAnyFilter =
    value.min_rating != null ||
    value.max_rating != null ||
    value.min_reviews != null ||
    value.min_negative != null ||
    value.has_owner_replies != null ||
    value.has_website != null ||
    value.has_lpr != null ||
    (value.pain_tag_ids?.length ?? 0) > 0 ||
    !!value.review_text_contains ||
    !!value.review_text_excludes ||
    (value.review_text_contains_any?.length ?? 0) > 0 ||
    (value.review_text_excludes_any?.length ?? 0) > 0 ||
    value.min_revenue != null ||
    value.min_age_years != null ||
    (value.opf_in?.length ?? 0) > 0 ||
    (value.source_filter != null && value.source_filter !== 'all');

  function commitWords(kind: 'contains' | 'excludes', raw: string) {
    const arr = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (kind === 'contains') {
      const next = arr.length ? arr : null;
      recordManualOverride('review_text_contains_any', next);
      onChange({
        ...value,
        review_text_contains: null, // legacy single-форму не используем здесь
        review_text_contains_any: next,
      });
    } else {
      const next = arr.length ? arr : null;
      recordManualOverride('review_text_excludes_any', next);
      onChange({
        ...value,
        review_text_excludes: null,
        review_text_excludes_any: next,
      });
    }
  }

  function parseNum(s: string): number | null {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function commit() {
    const minR = parseNum(localMinRating);
    const maxR = parseNum(localMaxRating);
    const minRev = parseNum(localMinReviews) as number | null;
    const minNeg = parseNum(localMinNegative) as number | null;
    recordManualOverride('min_rating', minR);
    recordManualOverride('max_rating', maxR);
    recordManualOverride('min_reviews', minRev);
    recordManualOverride('min_negative', minNeg);
    onChange({
      ...value,
      min_rating: minR,
      max_rating: maxR,
      min_reviews: minRev,
      min_negative: minNeg,
    });
  }

  /** Multi-preset AND: применяет/снимает встроенный пресет в наборе. */
  function togglePreset(p: Preset) {
    toggleAppliedId(`builtin:${p.id}`);
  }

  function isPresetActive(p: Preset): boolean {
    return appliedPresetIds.includes(`builtin:${p.id}`);
  }

  return (
    <aside className="space-y-4 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:[scrollbar-width:thin]">
      {/* Глобальный «Сбросить фильтры» наверху панели. Показываем всегда —
          серая (disabled) когда сбрасывать нечего, активная и яркая когда
          юзер накрутил фильтров и хочет вернуться к чистой выдаче. */}
      <button
        type="button"
        onClick={resetAllFilters}
        disabled={!hasAnyFilter}
        title={hasAnyFilter ? 'Сбросить все фильтры к дефолту' : 'Нечего сбрасывать — фильтры уже пустые'}
        className={cn(
          'inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
          hasAnyFilter
            ? 'border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-500 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20'
            : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500'
        )}
      >
        <Eraser className="h-3.5 w-3.5" />
        Сбросить фильтры
      </button>

      {/* Applied presets chips (Multi-preset AND). Показываем только если
          выбрано >=2 пресета — для одного пресета и так понятно по подсветке. */}
      {appliedPresetIds.length >= 2 && (
        <div className="rounded-md border border-brand-200 bg-brand-50 px-2.5 py-2 dark:border-brand-500/30 dark:bg-brand-500/10">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">
            Применено пресетов: {appliedPresetIds.length} · фильтры AND
          </div>
          <div className="flex flex-wrap gap-1">
            {appliedPresetIds.map((id) => {
              const label = labelOfPresetId(id, PRESETS, allUserPresets);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-brand-800 border border-brand-300 dark:bg-brand-500/10 dark:border-brand-400/40 dark:text-brand-200"
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => toggleAppliedId(id)}
                    aria-label={`Снять пресет ${label}`}
                    className="ml-0.5 -mr-0.5 rounded p-0.5 hover:bg-brand-100 dark:hover:bg-brand-500/20"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
          {presetConflicts.length > 0 && (
            <div className="mt-1.5 text-[10px] leading-tight text-amber-700 dark:text-amber-300">
              Конфликт в пресетах:{' '}
              {presetConflicts
                .map((c) => humanFieldLabel(c.field))
                .join(', ')}{' '}
              — учитываем значение первого применённого.
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Готовые пресеты
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => {
            const active = isPresetActive(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePreset(p)}
                title={
                  active
                    ? `Активен — клик ещё раз, чтобы снять фильтры. ${p.description ?? ''}`
                    : p.description
                }
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400/40 dark:border-brand-400 dark:bg-brand-500/10 dark:ring-brand-500/40'
                    : 'border-slate-300 bg-white hover:border-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-400 dark:hover:bg-slate-700'
                )}
              >
                <span
                  className={cn(
                    'text-xs font-medium',
                    active
                      ? 'text-emerald-900 dark:text-emerald-100'
                      : 'text-slate-800 dark:text-slate-200'
                  )}
                >
                  {p.label}
                </span>
                <span
                  className={cn(
                    'text-[10px] leading-tight',
                    active
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {p.shortHint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setUserPresetsTab('active')}
              className={cn(
                'text-[11px] font-medium uppercase tracking-wide transition-colors',
                userPresetsTab === 'active'
                  ? 'text-slate-700 dark:text-slate-200'
                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
              )}
            >
              Мои пресеты
              {activeUserPresets.length > 0 && (
                <span className="ml-1 text-slate-400 dark:text-slate-500">· {activeUserPresets.length}</span>
              )}
            </button>
            {hiddenUserPresets.length > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <button
                  type="button"
                  onClick={() => setUserPresetsTab('hidden')}
                  className={cn(
                    'text-[11px] font-medium uppercase tracking-wide transition-colors',
                    userPresetsTab === 'hidden'
                      ? 'text-slate-700 dark:text-slate-200'
                      : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                  )}
                >
                  Скрытые <span className="text-slate-400 dark:text-slate-500">· {hiddenUserPresets.length}</span>
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSaveModalOpen(true)}
            title="Сохранить текущие фильтры как пресет"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <BookmarkPlus className="h-3 w-3" /> сохранить
          </button>
        </div>
        {visibleUserPresets.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 px-2 py-2 text-[11px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
            {userPresetsTab === 'active' ? (
              <>Настрой фильтры, нажми «сохранить» — пресет появится здесь и
              будет доступен в один клик при следующих поисках.</>
            ) : (
              <>Скрытых пресетов нет. Скрыть пресет можно из вкладки «Мои пресеты»
              — он не удалится, просто уберётся из вида.</>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visibleUserPresets.map((p) => {
              const active = !p.hidden && isUserPresetActive(p);
              return (
              <div
                key={p.id}
                className={cn(
                  'group relative flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 pr-7 text-left transition-colors',
                  active
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400/40 dark:border-brand-400 dark:bg-brand-500/10 dark:ring-brand-500/40'
                    : p.hidden
                    ? 'border-slate-200 bg-slate-50/60 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-500'
                    : 'border-brand-200 bg-brand-50/40 hover:border-brand-400 dark:border-brand-500/30 dark:bg-brand-500/5 dark:hover:border-brand-400/60'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleUserPreset(p)}
                  title={
                    active
                      ? `Активен — клик ещё раз, чтобы снять фильтры. ${p.description ?? ''}`
                      : p.description ?? 'мой пресет'
                  }
                  className="block w-full text-left"
                >
                  <span className="block text-xs font-medium text-slate-800 dark:text-slate-200">
                    {p.name}
                    {p.ai_prompt && p.ai_prompt.trim() && (
                      <span
                        title="С AI-анализом: при применении посчитает score 0-10 для каждой компании"
                        className="ml-1 inline-flex items-center rounded bg-violet-100 px-1 py-0 text-[9px] font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-300"
                      >
                        AI
                      </span>
                    )}
                  </span>
                  <span className={cn(
                    'block text-[10px] leading-tight',
                    p.hidden ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-700/80 dark:text-emerald-400/80'
                  )}>
                    {p.hidden ? 'скрыт' : 'мой'}
                  </span>
                </button>
                <div className="absolute right-1 top-1 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {p.hidden ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleHidden(p, false);
                      }}
                      title="Вернуть в активные"
                      aria-label={`Вернуть пресет ${p.name}`}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleHidden(p, true);
                      }}
                      title="Скрыть (можно вернуть из вкладки «Скрытые»)"
                      aria-label={`Скрыть пресет ${p.name}`}
                      className="rounded p-0.5 text-slate-400 hover:bg-brand-100 hover:text-slate-700"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteUserPreset(p);
                    }}
                    title="Удалить навсегда"
                    aria-label={`Удалить пресет ${p.name}`}
                    className="rounded p-0.5 text-slate-400 hover:bg-[var(--signal-hot-bg)] hover:text-[color:var(--signal-hot)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <SaveFilterPresetModal
        open={saveModalOpen}
        filter={value}
        onClose={() => setSaveModalOpen(false)}
        onSaved={handlePresetSaved}
      />

      <Dialog
        open={confirmDelete !== null}
        onClose={() => !deleteInProgress && setConfirmDelete(null)}
        title="Удалить пресет?"
      >
        <div className="space-y-4 p-6">
          <div className="text-sm text-slate-700">
            Удалить пресет <strong>«{confirmDelete?.name}»</strong> навсегда?
          </div>
          <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-3 py-2 text-[12px] text-[color:var(--signal-warm)]">
            Если хочешь временно убрать с глаз — лучше нажми «скрыть» (иконка глаза).
            Пресет уедет во вкладку «Скрытые», откуда его легко вернуть.
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={deleteInProgress}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void confirmDeleteNow()}
              disabled={deleteInProgress}
              className="rounded-v2-sm bg-[color:var(--signal-hot)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {deleteInProgress ? 'Удаляю…' : 'Удалить'}
            </button>
          </div>
        </div>
      </Dialog>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Рейтинг</label>
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
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
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
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
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
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
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
            const next = v === 'yes' ? true : v === 'no' ? false : null;
            recordManualOverride('has_owner_replies', next);
            onChange({ ...value, has_owner_replies: next });
          }}
        >
          <option value="any">Не важно</option>
          <option value="yes">Только с ответами</option>
          <option value="no">Только без ответов</option>
        </Select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
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
            const next = v === 'yes' ? true : v === 'no' ? false : null;
            recordManualOverride('has_website', next);
            onChange({ ...value, has_website: next });
          }}
        >
          <option value="any">Не важно</option>
          <option value="yes">Только с сайтом</option>
          <option value="no">Только без сайта</option>
        </Select>
      </div>

      {/* 2026-06-12: ЛПР. Источники — DaData (CompanyLegal.director_name)
          и парсер /team на сайте (CompanyDecisionMaker). Есть хотя бы один
          из двух → has_lpr=true. */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          ЛПР
        </label>
        <Select
          value={
            value.has_lpr === true
              ? 'yes'
              : value.has_lpr === false
                ? 'no'
                : 'any'
          }
          onChange={(e) => {
            const v = e.target.value;
            const next = v === 'yes' ? true : v === 'no' ? false : null;
            recordManualOverride('has_lpr', next);
            onChange({ ...value, has_lpr: next });
          }}
        >
          <option value="any">Не важно</option>
          <option value="yes">Только с ЛПР</option>
          <option value="no">Только без ЛПР</option>
        </Select>
      </div>

      {/* Multi-source (ТЗ 2026-06-04 §3.1): фильтр по источнику и в боковой
          панели тоже — дублирует сегмент в шапке выдачи. Полезно когда юзер
          сохраняет пресет с фильтром источника или открывает выдачу с узкого
          экрана где шапка прокручена. */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Источник
        </label>
        <Select
          value={value.source_filter ?? 'all'}
          onChange={(e) => {
            const v = e.target.value as 'all' | '2gis' | 'yandex_maps' | 'google_maps';
            recordManualOverride('source_filter', v);
            onChange({ ...value, source_filter: v });
          }}
        >
          <option value="all">Все источники</option>
          <option value="2gis">Только 2GIS</option>
          <option value="yandex_maps">Только Я.Карты</option>
          <option value="google_maps">Только Google</option>
        </Select>
      </div>

      {/* Блок 2 ТЗ 2026-06-02: фильтр «Платёжеспособные» через company_legal.
          Свёрнут по умолчанию — нужен редко, экономит ~150px скролла.
          Открывается с автоматически если в фильтре есть min_revenue/min_age_years. */}
      <details
        className="group rounded-v2-sm border border-[color:var(--signal-cool)]/30 bg-[var(--signal-cool-bg)] p-2 open:pb-3"
        open={Boolean(value.min_revenue || value.min_age_years)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
          <span className="inline-flex items-center gap-1.5">
            💼 Платёжеспособные (DaData)
            {Boolean(value.min_revenue || value.min_age_years) && (
              <span className="rounded-full bg-blue-200/70 px-1.5 py-0.5 text-[9px] font-semibold text-blue-800 dark:bg-blue-500/30 dark:text-blue-200">
                активно
              </span>
            )}
          </span>
          <span className="text-blue-500 group-open:rotate-180 transition-transform">
            ▾
          </span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[11px] text-slate-600 dark:text-slate-400">
              Оборот от ₽
            </label>
            <Input
              type="number"
              placeholder="напр.: 5000000"
              value={value.min_revenue ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                const next = v === '' ? null : Number(v);
                recordManualOverride('min_revenue', next);
                onChange({ ...value, min_revenue: next });
              }}
              className="text-[12px]"
            />
            {/* Подсказка по «реалистичному» минимуму. У ИП и ООО формально
                оборот может быть 0 (нулёвка). Для B2B-лидгена живой
                микро-точки (одна стоматология, кофейня) разумно отсекать
                от 3-5 млн ₽/год — компании ниже либо мёртвые, либо в
                stealth-mode и платить за сайт вряд ли захотят. */}
            <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              реалистичный минимум живой точки — от ~3-5 млн ₽/год
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] text-slate-600 dark:text-slate-400">
              Возраст, лет
            </label>
            <Input
              type="number"
              placeholder="напр.: 2"
              value={value.min_age_years ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                const next = v === '' ? null : Number(v);
                recordManualOverride('min_age_years', next);
                onChange({ ...value, min_age_years: next });
              }}
              className="text-[12px]"
            />
          </div>
        </div>
        <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
          Применит JOIN company_legal — покажет только компании с
          подтянутыми юр.данными.
        </div>
      </details>

      {/* 2026-06-19: фильтр «Тип юр.лица» (ООО/ИП/АО/прочие/нет данных).
          Источник — CompanyLegal.opf, заполняется DaData при обогащении
          и backfill'ится регулярным выражением из legal_short_name.
          Свёрнут по умолчанию — отдельная семантика от «Платёжеспособных»
          (там фильтр по обороту/возрасту, здесь — по форме собственности). */}
      {(() => {
        const opfOptions: { value: string; label: string; hint?: string }[] = [
          { value: 'ООО', label: 'ООО', hint: 'Общество с ограниченной ответственностью' },
          { value: 'ИП', label: 'ИП', hint: 'Индивидуальный предприниматель' },
          { value: 'АО', label: 'АО', hint: 'Акционерное общество' },
          { value: 'ПАО', label: 'ПАО', hint: 'Публичное акционерное общество' },
          { value: '__unknown__', label: 'Нет данных', hint: 'DaData не нашла или не отдала тип' },
        ];
        const selected = new Set(value.opf_in ?? []);
        const active = selected.size > 0;
        return (
          <details
            className="group rounded-v2-sm border border-slate-200 bg-slate-50/40 p-2 open:pb-3 dark:border-slate-700 dark:bg-slate-800/40"
            open={active}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                🏛 Тип юр.лица
                {active && (
                  <span className="rounded-full bg-slate-300/60 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 dark:bg-slate-600/60 dark:text-slate-200">
                    {selected.size}
                  </span>
                )}
              </span>
              <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {opfOptions.map((opt) => {
                const on = selected.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      const next = new Set(selected);
                      if (on) next.delete(opt.value);
                      else next.add(opt.value);
                      const arr = Array.from(next);
                      const nextVal = arr.length > 0 ? arr : null;
                      recordManualOverride('opf_in', nextVal);
                      onChange({ ...value, opf_in: nextVal });
                    }}
                    title={opt.hint}
                    className={
                      'rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors ' +
                      (on
                        ? 'border-slate-700 bg-slate-700 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200')
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              Тянется из DaData при обогащении (поле opf). «Нет данных» —
              для компаний без CompanyLegal или с пустым opf.
            </div>
          </details>
        );
      })()}

      {/* Слова в отзывах — тоже свёрнут по умолчанию, экономит ~200px. */}
      <details
        className="group rounded-md border border-slate-200 bg-slate-50/40 p-2 open:pb-3 dark:border-slate-700 dark:bg-slate-800/40"
        open={Boolean(
          value.review_text_contains_any?.length ||
            value.review_text_excludes_any?.length ||
            value.review_text_contains ||
            value.review_text_excludes,
        )}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            💬 Слова в отзывах
            {Boolean(
              value.review_text_contains_any?.length ||
                value.review_text_excludes_any?.length ||
                value.review_text_contains ||
                value.review_text_excludes,
            ) && (
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 dark:bg-slate-600 dark:text-slate-200">
                активно
              </span>
            )}
          </span>
          <span className="text-slate-400 group-open:rotate-180 transition-transform">
            ▾
          </span>
        </summary>
        <div className="mt-2 mb-2">
          <label className="mb-0.5 block text-[11px] text-emerald-700 dark:text-emerald-400">
            содержит (через запятую) — компании с любым из слов
          </label>
          <Input
            type="text"
            placeholder="напр.: долго ждал, грязно, не дозвонился"
            value={localContainsWords}
            onChange={(e) => setLocalContainsWords(e.target.value)}
            onBlur={() => commitWords('contains', localContainsWords)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitWords('contains', localContainsWords);
              }
            }}
            className="text-[12px]"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-rose-700 dark:text-rose-400">
            не содержит (через запятую) — выкинуть компании с этими словами
          </label>
          <Input
            type="text"
            placeholder="напр.: отлично, рекомендую"
            value={localExcludesWords}
            onChange={(e) => setLocalExcludesWords(e.target.value)}
            onBlur={() => commitWords('excludes', localExcludesWords)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitWords('excludes', localExcludesWords);
              }
            }}
            className="text-[12px]"
          />
        </div>
        {(value.review_text_contains_any?.length ||
          value.review_text_excludes_any?.length ||
          value.review_text_contains ||
          value.review_text_excludes) && (
          <button
            type="button"
            onClick={() => {
              setLocalContainsWords('');
              setLocalExcludesWords('');
              onChange({
                ...value,
                review_text_contains: null,
                review_text_excludes: null,
                review_text_contains_any: null,
                review_text_excludes_any: null,
              });
            }}
            className="mt-2 text-[11px] text-slate-500 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            очистить слова
          </button>
        )}
      </details>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Сортировка</label>
        <Select
          value={value.sort_by ?? 'rating_desc'}
          onChange={(e) => {
            const next = e.target.value as SortBy;
            recordManualOverride('sort_by', next);
            onChange({ ...value, sort_by: next });
          }}
        >
          <option value="rating_desc">Рейтинг ↓</option>
          <option value="rating_asc">Рейтинг ↑</option>
          <option value="reviews_desc">Больше отзывов</option>
          <option value="negative_desc">Больше негатива</option>
          <option value="pain_desc">По упоминаниям болей</option>
          <option value="temperature_desc">🔥 Температура лида ↓</option>
          <option value="website_score_desc">💼 Нужен сайт (score) ↓</option>
          {aiActive && (
            <>
              <option value="ai_score_desc">AI score ↓ (готовые сверху)</option>
              <option value="ai_score_asc">AI score ↑ (низкие сверху)</option>
            </>
          )}
        </Select>
        {aiActive && (
          <p className="mt-1 text-[11px] text-violet-700/80 dark:text-violet-300/80">
            Компании без AI-оценки — в конце списка.
          </p>
        )}
      </div>

      {/* Pain-cloud. 2026-06-12 переработана вёрстка по жалобе юзера:
          раньше заголовок «🧠 БОЛИ КЛИЕНТОВ (AI-ТЕГИ)» был UPPERCASE +
          tracking-wide и переносился на 2 строки в узкой панели, а
          круглый бейдж «1 ВЫБРАНО» был огромным. Теперь: заголовок в
          одну строку («Боли клиентов» без скобочного хвоста), счётчик —
          компактный pill, плитки тегов — обычной плотности (см. PainTagsCloud). */}
      <details
        className="group rounded-md border border-violet-200 bg-violet-50/40 p-2 open:pb-3 dark:border-violet-700/40 dark:bg-violet-900/20"
        open={Boolean(value.pain_tag_ids?.length)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-violet-800 dark:text-violet-200">
            <span aria-hidden>🧠</span>
            <span className="truncate">Боли клиентов</span>
            {(value.pain_tag_ids?.length ?? 0) > 0 && (
              <span className="rounded bg-violet-200 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-violet-800 dark:bg-violet-500/30 dark:text-violet-100">
                {value.pain_tag_ids?.length}
              </span>
            )}
          </span>
          <span className="text-violet-500 group-open:rotate-180 transition-transform">
            ▾
          </span>
        </summary>
        <div className="mt-2">
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
      </details>
    </aside>
  );
}

function joinWords(single: string | null | undefined, many: string[] | null | undefined): string {
  const arr = [single, ...(many ?? [])].filter(Boolean) as string[];
  return arr.join(', ');
}
