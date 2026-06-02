'use client';

/**
 * Панель фильтров для списка компаний поиска.
 *
 * Контролы реализованы без shadcn (его в проекте нет) — нативные input/select.
 * 3 пресета внизу — быстрые сценарии «Кризис репутации», «Падение рейтинга»,
 * «Стабильный».
 */

import { useCallback, useEffect, useState } from 'react';
import { BookmarkPlus, EyeOff, RotateCcw, X } from 'lucide-react';

import { BUILTIN_PRESETS, type BuiltinPreset } from '@/components/maps/builtinPresets';
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

  function applyUserPreset(p: UserPresetOut) {
    onChange({
      ...(p.filter as MapSearchFilter),
      pain_tag_ids: value.pain_tag_ids,
    });
    if (p.ai_prompt && p.ai_prompt.trim()) {
      onUserPresetWithAiSelected?.(p);
    }
  }

  /** Точное совпадение фильтра пользовательского пресета с текущим. Та же
   *  логика что у isPresetActive — null/undefined эквивалентны, массивы как
   *  отсортированный JSON. */
  function isUserPresetActive(p: UserPresetOut): boolean {
    const norm = (v: unknown): string => {
      if (v == null) return 'null';
      if (Array.isArray(v)) return JSON.stringify([...v].sort());
      return JSON.stringify(v);
    };
    const f = (p.filter ?? {}) as Record<string, unknown>;
    for (const [k, expected] of Object.entries(f)) {
      const actual = (value as Record<string, unknown>)[k];
      if (norm(expected) !== norm(actual)) return false;
    }
    return true;
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

  function commitWords(kind: 'contains' | 'excludes', raw: string) {
    const arr = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (kind === 'contains') {
      onChange({
        ...value,
        review_text_contains: null, // legacy single-форму не используем здесь
        review_text_contains_any: arr.length ? arr : null,
      });
    } else {
      onChange({
        ...value,
        review_text_excludes: null,
        review_text_excludes_any: arr.length ? arr : null,
      });
    }
  }

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

  /** Активен ли пресет — точное совпадение всех его значений в текущем фильтре.
   *  Сравниваем сериализацией: null/undefined считаем эквивалентными (важно
   *  для полей, которых нет в пресете). Массивы сравниваем как JSON. */
  function isPresetActive(p: Preset): boolean {
    const norm = (v: unknown): string => {
      if (v == null) return 'null';
      if (Array.isArray(v)) return JSON.stringify([...v].sort());
      return JSON.stringify(v);
    };
    for (const [k, expected] of Object.entries(p.filter)) {
      const actual = (value as Record<string, unknown>)[k];
      if (norm(expected) !== norm(actual)) return false;
    }
    return true;
  }

  return (
    <aside className="space-y-5 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
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
                onClick={() => applyPreset(p)}
                title={p.description}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300 dark:border-emerald-400 dark:bg-emerald-900/30 dark:ring-emerald-700/50'
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
                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300 dark:border-emerald-400 dark:bg-emerald-900/30 dark:ring-emerald-700/50'
                    : p.hidden
                    ? 'border-slate-200 bg-slate-50/60 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-500'
                    : 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-400 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:hover:border-emerald-500/60'
                )}
              >
                <button
                  type="button"
                  onClick={() => applyUserPreset(p)}
                  title={p.description ?? 'мой пресет'}
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
                      className="rounded p-0.5 text-slate-400 hover:bg-emerald-100 hover:text-slate-700"
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
                    className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800">
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
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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

      <div className="rounded-md border border-slate-200 bg-slate-50/40 p-2 dark:border-slate-700 dark:bg-slate-800/40">
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Слова в отзывах
        </div>
        <div className="mb-2">
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
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Сортировка</label>
        <Select
          value={value.sort_by ?? 'rating_desc'}
          onChange={(e) => onChange({ ...value, sort_by: e.target.value as SortBy })}
        >
          <option value="rating_desc">Рейтинг ↓</option>
          <option value="rating_asc">Рейтинг ↑</option>
          <option value="reviews_desc">Больше отзывов</option>
          <option value="negative_desc">Больше негатива</option>
          <option value="pain_desc">По упоминаниям болей</option>
          <option value="temperature_desc">🔥 Температура лида ↓</option>
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

function joinWords(single: string | null | undefined, many: string[] | null | undefined): string {
  const arr = [single, ...(many ?? [])].filter(Boolean) as string[];
  return arr.join(', ');
}
