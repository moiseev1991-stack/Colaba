'use client';

/**
 * Панель фильтров для списка компаний поиска.
 *
 * Контролы реализованы без shadcn (его в проекте нет) — нативные input/select.
 * Готовые пресеты ниже — см. BUILTIN_PRESETS (источник истины).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Check, ChevronDown, EyeOff, RotateCcw, X } from 'lucide-react';

import { BUILTIN_PRESETS, type BuiltinPreset } from '@/components/maps/builtinPresets';
import {
  findPresetConflicts,
  humanFieldLabel,
  mergePresetsAND,
} from '@/components/maps/multiPresetMerge';
import { PainTagsCloud } from '@/components/maps/PainTagsCloud';
import { SaveFilterPresetModal } from '@/components/maps/SaveFilterPresetModal';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MapSearchFilter, SourceCountsOut } from '@/src/services/api/maps';
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
  /** Сколько компаний в каждом источнике — счётчики на чипах «Источник». */
  sourceCounts?: SourceCountsOut | null;
  /** Меняется, когда страница сбросила все фильтры сама («Сбросить всё» у токенов). */
  resetKey?: number;
}

/**
 * Боковая панель фильтров выдачи (вид Premium, 16.09): сворачиваемые разделы
 * «Готовые сценарии», «Рейтинг и отзывы», «Сайт и контакты», «Юр. данные», «Слова в отзывах»,
 * «Боли клиентов», «Источник». Сортировка — в строке над списком.
 * Фильтр «Оборот / возраст» убран: бэкенд его не принимает (выдача не менялась).
 */
export function MapsFiltersPanel({
  niche, city, searchId, value, onChange, onUserPresetWithAiSelected, sourceCounts, resetKey = 0,
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
  // Inline-ошибка операций с пресетами (delete/hide). Заменяет window.alert
  // — расширения браузера часто блокируют alert, плюс модальный alert рвёт
  // фокус. Показываем внизу списка пресетов на 4 секунды.
  const [presetError, setPresetError] = useState<string | null>(null);

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
      setPresetError(null);
    } catch (e) {
      setPresetError('Не удалось удалить пресет. Попробуй ещё раз.');
      setTimeout(() => setPresetError(null), 4000);
    } finally {
      setDeleteInProgress(false);
    }
  }, [confirmDelete]);

  const handleToggleHidden = useCallback(async (preset: UserPresetOut, hidden: boolean) => {
    try {
      const updated = await updateUserPreset(preset.id, { hidden });
      setAllUserPresets((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setPresetError(null);
    } catch (e) {
      setPresetError('Не удалось изменить статус пресета.');
      setTimeout(() => setPresetError(null), 4000);
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
      hiring_marketing: null,
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
    (value.source_filter != null && value.source_filter !== 'all') ||
    value.hiring_marketing != null;

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

  // Токены сверху страницы убирают поля по одному — забываем и ручную правку этого поля,
  // иначе следующий клик по пресету вернул бы снятый фильтр.
  useEffect(() => {
    setManualOverrides((prev) => {
      const keys = Object.keys(prev) as (keyof MapSearchFilter)[];
      const stale = keys.filter((k) => value[k] == null || (k === 'source_filter' && value[k] === 'all'));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const k of stale) delete next[k];
      return next;
    });
  }, [value]);

  // «Сбросить всё» на странице результатов — забываем применённые пресеты.
  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (resetKey === lastResetKey.current) return;
    lastResetKey.current = resetKey;
    setAppliedPresetIds([]);
    setManualOverrides({});
  }, [resetKey]);

  const triSelect = (
    field: 'has_owner_replies' | 'has_website' | 'has_lpr' | 'hiring_marketing',
    labels: [string, string, string],
    id: string,
  ) => (
    <Select
      id={id}
      wrapperClassName="block"
      className="w-full"
      value={value[field] === true ? 'yes' : value[field] === false ? 'no' : 'any'}
      onChange={(e) => {
        const v = e.target.value;
        const next = v === 'yes' ? true : v === 'no' ? false : null;
        recordManualOverride(field, next);
        onChange({ ...value, [field]: next });
      }}
    >
      <option value="any">{labels[0]}</option>
      <option value="yes">{labels[1]}</option>
      <option value="no">{labels[2]}</option>
    </Select>
  );

  const wordsActive = Boolean(
    value.review_text_contains_any?.length ||
      value.review_text_excludes_any?.length ||
      value.review_text_contains ||
      value.review_text_excludes,
  );
  const opfSelected = new Set(value.opf_in ?? []);
  const sourceValue = value.source_filter ?? 'all';
  const sourceOptions: { value: 'all' | '2gis' | 'yandex_maps' | 'google_maps'; label: string; count?: number }[] = [
    { value: 'all', label: 'Все', count: sourceCounts?.total },
    { value: '2gis', label: '2GIS', count: sourceCounts?.twogis },
    { value: 'yandex_maps', label: 'Я.Карты', count: sourceCounts?.yandex_maps },
    { value: 'google_maps', label: 'Google' },
  ];
  const ratingCount = [value.min_rating, value.max_rating, value.min_reviews, value.min_negative, value.has_owner_replies].filter(
    (v) => v != null,
  ).length;
  const contactsCount = [value.has_website, value.has_lpr, value.hiring_marketing].filter((v) => v != null).length;

  return (
    <aside aria-label="Фильтры" className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 px-1 pb-1">
        <h2 className="text-xl font-extrabold tracking-tight text-ui-text">Фильтры</h2>
        <button
          type="button"
          onClick={resetAllFilters}
          disabled={!hasAnyFilter}
          className="text-small font-semibold text-ui-danger hover:underline disabled:cursor-default disabled:text-ui-text-muted/60 disabled:no-underline"
        >
          Сбросить
        </button>
      </div>
      <p className="px-1 pb-4 text-xs text-ui-text-muted">Применяются к найденным компаниям сразу, без нового поиска</p>

      {appliedPresetIds.length >= 2 && (
        <div className="mb-3 rounded-card bg-ui-accent/[.06] px-3 py-2.5">
          <div className="mb-1.5 text-xs font-semibold text-ui-accent">Пресетов: {appliedPresetIds.length} — действуют все сразу</div>
          <div className="flex flex-wrap gap-1">
            {appliedPresetIds.map((id) => {
              const label = labelOfPresetId(id, PRESETS, allUserPresets);
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-ui-surface px-2.5 py-0.5 text-xs font-semibold text-ui-text">
                  {label}
                  <button
                    type="button"
                    onClick={() => toggleAppliedId(id)}
                    aria-label={`Снять пресет ${label}`}
                    className="-mr-1 rounded-full p-0.5 text-ui-text-muted hover:text-ui-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
          {presetConflicts.length > 0 && (
            <div className="mt-1.5 text-xs text-ui-warning">
              Пресеты расходятся в полях: {presetConflicts.map((c) => humanFieldLabel(c.field)).join(', ')} — берём значение
              первого.
            </div>
          )}
        </div>
      )}

      <FilterSection title="Готовые сценарии" defaultOpen count={appliedPresetIds.length}>
        <div className="flex flex-col gap-0.5">
          {PRESETS.map((p) => (
            <ScenarioRow key={p.id} active={isPresetActive(p)} onClick={() => togglePreset(p)} title={p.description} label={p.label} hint={p.shortHint} />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setUserPresetsTab('active')}
              className={userPresetsTab === 'active' ? 'text-ui-text' : 'text-ui-text-muted hover:text-ui-text'}
            >
              Мои пресеты{activeUserPresets.length > 0 && ` · ${activeUserPresets.length}`}
            </button>
            {hiddenUserPresets.length > 0 && (
              <button
                type="button"
                onClick={() => setUserPresetsTab('hidden')}
                className={userPresetsTab === 'hidden' ? 'text-ui-text' : 'text-ui-text-muted hover:text-ui-text'}
              >
                Скрытые · {hiddenUserPresets.length}
              </button>
            )}
          </div>
        </div>
        {presetError && (
          <div role="alert" className="mx-1 mt-2 rounded-control bg-ui-danger/10 px-2.5 py-1.5 text-xs text-ui-danger">
            {presetError}
          </div>
        )}
        {visibleUserPresets.length === 0 ? (
          <p className="px-1 pt-1.5 text-xs text-ui-text-muted">
            {userPresetsTab === 'active'
              ? 'Настройте фильтры и сохраните — пресет появится здесь.'
              : 'Скрытых пресетов нет.'}
          </p>
        ) : (
          <div className="mt-1 flex flex-col gap-0.5">
            {visibleUserPresets.map((p) => (
              <div key={p.id} className="group relative">
                <ScenarioRow
                  active={!p.hidden && isUserPresetActive(p)}
                  onClick={() => toggleUserPreset(p)}
                  title={p.description ?? 'Мой пресет'}
                  label={p.name}
                  ai={!!(p.ai_prompt && p.ai_prompt.trim())}
                  muted={p.hidden}
                  className="pr-14"
                />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => void handleToggleHidden(p, !p.hidden)}
                    title={p.hidden ? 'Вернуть в мои пресеты' : 'Скрыть (вернуть можно из «Скрытых»)'}
                    aria-label={p.hidden ? `Вернуть пресет ${p.name}` : `Скрыть пресет ${p.name}`}
                    className="rounded-full bg-ui-surface p-1 text-ui-text-muted shadow-raised hover:text-ui-text"
                  >
                    {p.hidden ? <RotateCcw className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteUserPreset(p)}
                    title="Удалить навсегда"
                    aria-label={`Удалить пресет ${p.name}`}
                    className="rounded-full bg-ui-surface p-1 text-ui-text-muted shadow-raised hover:text-ui-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </FilterSection>

      <FilterSection title="Рейтинг и отзывы" defaultOpen count={ratingCount}>
        <div className="flex flex-col gap-3">
          <div>
            <span className={FIELD_LABEL}>Рейтинг 0–5</span>
            <div className="grid grid-cols-[1fr_14px_1fr] items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={5}
                step={0.1}
                placeholder="от"
                aria-label="Рейтинг от"
                value={localMinRating}
                onChange={(e) => setLocalMinRating(e.target.value)}
                onBlur={commit}
              />
              <span className="text-center text-ui-text-muted" aria-hidden>
                —
              </span>
              <Input
                type="number"
                min={0}
                max={5}
                step={0.1}
                placeholder="до"
                aria-label="Рейтинг до"
                value={localMaxRating}
                onChange={(e) => setLocalMaxRating(e.target.value)}
                onBlur={commit}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="flt-min-reviews" className={FIELD_LABEL}>
                Отзывов от
              </label>
              <Input
                id="flt-min-reviews"
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
              <label htmlFor="flt-min-negative" className={FIELD_LABEL}>
                Негативных от
              </label>
              <Input
                id="flt-min-negative"
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
            <label htmlFor="flt-owner-replies" className={FIELD_LABEL}>
              Ответы владельца
            </label>
            {triSelect('has_owner_replies', ['Не важно', 'Только с ответами', 'Только без ответов'], 'flt-owner-replies')}
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Сайт и контакты" count={contactsCount}>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="flt-website" className={FIELD_LABEL}>
              Свой сайт
            </label>
            {triSelect('has_website', ['Не важно', 'Только с сайтом', 'Только без сайта'], 'flt-website')}
          </div>
          <div>
            <label htmlFor="flt-lpr" className={FIELD_LABEL}>
              ЛПР (руководитель)
            </label>
            {triSelect('has_lpr', ['Не важно', 'Только с ЛПР', 'Только без ЛПР'], 'flt-lpr')}
          </div>
          <div>
            <label htmlFor="flt-hiring" className={FIELD_LABEL}>
              Ищут маркетолога на hh.ru
            </label>
            {triSelect('hiring_marketing', ['Не важно', 'Только те, кто ищет', 'Только те, кто не ищет'], 'flt-hiring')}
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Юр. данные" count={opfSelected.size}>
        <span className={FIELD_LABEL}>Тип юр. лица</span>
        <div className="flex flex-wrap gap-1.5">
          {OPF_OPTIONS.map((opt) => {
            const on = opfSelected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={on}
                title={opt.hint}
                onClick={() => {
                  const next = new Set(opfSelected);
                  if (on) next.delete(opt.value);
                  else next.add(opt.value);
                  const nextVal = next.size > 0 ? Array.from(next) : null;
                  recordManualOverride('opf_in', nextVal);
                  onChange({ ...value, opf_in: nextVal });
                }}
                className={cn(CHIP, on && CHIP_ON)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ui-text-muted">Из DaData. «Нет данных» — компании без юр. сведений.</p>
      </FilterSection>

      <FilterSection title="Слова в отзывах" count={wordsActive ? 1 : 0}>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="flt-words-contains" className={FIELD_LABEL}>
              Содержит — любое из слов
            </label>
            <Input
              id="flt-words-contains"
              type="text"
              placeholder="не дозвонился, грязно"
              value={localContainsWords}
              onChange={(e) => setLocalContainsWords(e.target.value)}
              onBlur={() => commitWords('contains', localContainsWords)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitWords('contains', localContainsWords);
                }
              }}
            />
          </div>
          <div>
            <label htmlFor="flt-words-excludes" className={FIELD_LABEL}>
              Не содержит
            </label>
            <Input
              id="flt-words-excludes"
              type="text"
              placeholder="рекомендую, отлично"
              value={localExcludesWords}
              onChange={(e) => setLocalExcludesWords(e.target.value)}
              onBlur={() => commitWords('excludes', localExcludesWords)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitWords('excludes', localExcludesWords);
                }
              }}
            />
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Боли клиентов" count={value.pain_tag_ids?.length ?? 0}>
        <PainTagsCloud
          niche={niche}
          city={city}
          searchId={searchId}
          value={value.pain_tag_ids ?? []}
          onChange={(ids) => onChange({ ...value, pain_tag_ids: ids.length ? ids : null })}
        />
      </FilterSection>

      <FilterSection title="Источник" count={sourceValue !== 'all' ? 1 : 0}>
        <div className="flex flex-wrap gap-1.5">
          {sourceOptions.map((opt) => {
            const on = sourceValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  recordManualOverride('source_filter', opt.value);
                  onChange({ ...value, source_filter: opt.value });
                }}
                className={cn(CHIP, on && CHIP_ON)}
              >
                {opt.label}
                {typeof opt.count === 'number' && <span className="ml-1 tabular-nums opacity-70">· {opt.count}</span>}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <div className="border-y border-black/[.08] px-1 py-4">
        <button type="button" onClick={() => setSaveModalOpen(true)} className={cn(CHIP, 'border-dashed text-ui-text-muted')}>
          <BookmarkPlus className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          Сохранить как пресет
        </button>
      </div>

      <SaveFilterPresetModal open={saveModalOpen} filter={value} onClose={() => setSaveModalOpen(false)} onSaved={handlePresetSaved} />

      <Dialog open={confirmDelete !== null} onClose={() => !deleteInProgress && setConfirmDelete(null)} title="Удалить пресет?">
        <div className="space-y-4">
          <p className="text-sm text-ui-text">
            Удалить пресет <strong>«{confirmDelete?.name}»</strong> навсегда?
          </p>
          <p className="rounded-control bg-ui-warning/10 px-3 py-2 text-xs text-ui-warning">
            Если нужно лишь убрать с глаз — нажмите «скрыть» (глаз): пресет уйдёт в «Скрытые», оттуда его легко вернуть.
          </p>
          <div className="flex justify-end gap-2 border-t border-ui-border pt-3">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleteInProgress}>
              Отмена
            </Button>
            <Button variant="danger" onClick={() => void confirmDeleteNow()} loading={deleteInProgress}>
              Удалить
            </Button>
          </div>
        </div>
      </Dialog>
    </aside>
  );
}

const FIELD_LABEL = 'mb-1.5 block text-xs font-medium text-ui-text-muted';
const CHIP =
  'min-h-8 rounded-full border border-ui-border bg-ui-surface px-3.5 py-1 text-xs font-semibold text-ui-text-muted transition-colors hover:border-ui-text-muted/50 hover:text-ui-text';
const CHIP_ON = 'border-ui-text bg-ui-text text-ui-surface hover:border-ui-text hover:text-ui-surface';

const OPF_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'ООО', label: 'ООО', hint: 'Общество с ограниченной ответственностью' },
  { value: 'ИП', label: 'ИП', hint: 'Индивидуальный предприниматель' },
  { value: 'АО', label: 'АО', hint: 'Акционерное общество' },
  { value: 'ПАО', label: 'ПАО', hint: 'Публичное акционерное общество' },
  { value: '__unknown__', label: 'нет данных', hint: 'DaData не нашла или не отдала тип' },
];

/** Раздел фильтров: заголовок капсом со счётчиком заданных полей, сворачивается. */
function FilterSection({
  title,
  defaultOpen = false,
  count = 0,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || count > 0);
  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="group border-t border-black/[.08] px-1 py-3.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control text-xs font-bold uppercase tracking-[.08em] text-ui-text-muted hover:text-ui-text [&::-webkit-details-marker]:hidden">
        {title}
        {count > 0 && (
          <span className="rounded-full bg-ui-accent px-1.5 text-xs font-bold normal-case tracking-normal text-ui-accent-contrast">{count}</span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/** Строка сценария / пресета: кружок-отметка, название, подсказка. */
function ScenarioRow({
  active,
  onClick,
  title,
  label,
  hint,
  ai,
  muted,
  className,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  label: string;
  hint?: string;
  ai?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={active ? `Включён — нажмите ещё раз, чтобы снять. ${title ?? ''}` : title}
      className={cn(
        'flex min-h-10 w-full items-center gap-2.5 rounded-card px-2.5 py-2 text-left text-small transition-colors',
        active ? 'bg-ui-accent/[.08] font-semibold text-ui-text' : 'text-ui-text-muted hover:bg-ui-surface-2 hover:text-ui-text',
        muted && 'opacity-60',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
          active ? 'border-ui-accent bg-ui-accent text-ui-accent-contrast' : 'border-ui-border text-transparent',
        )}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {label}
          {ai && <span className="ml-1.5 rounded-full bg-ui-accent px-1.5 text-xs font-bold text-ui-accent-contrast">AI</span>}
        </span>
        {hint && <span className="block truncate text-xs font-normal text-ui-text-muted">{hint}</span>}
      </span>
    </button>
  );
}

function joinWords(single: string | null | undefined, many: string[] | null | undefined): string {
  const arr = [single, ...(many ?? [])].filter(Boolean) as string[];
  return arr.join(', ');
}
