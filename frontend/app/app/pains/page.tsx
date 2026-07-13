'use client';

/**
 * /app/pains — «Поиск компаний по боли».
 *
 * Три способа найти компании:
 *   1) Быстрый dropdown pain_key (8 категорий: call_no_answer, schedule_hard,
 *      admin_rude, ...) — старый путь.
 *   2) Плитка ТОП-БОЛЕЙ ниши — horizontal scroll, click = выбрать конкретный
 *      PainTag (не pain_key). Показывается когда выбрана ниша.
 *   3) Text-search по label PainTag — для случая когда pain_keys не хватает
 *      (например «грязный бассейн»). Работает в рамках выбранной ниши.
 *
 * Клик по плитке или выбор из text-search дёргает endpoint с pain_tag_ids
 * (не pain_key) — минуя match_pain_key.
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { AddToListModal } from '@/components/maps/AddToListModal';
import { MapsCompanyDetailDrawer } from '@/components/maps/MapsCompanyDetailDrawer';
import {
  listCompaniesByPain,
  listMapCities,
  listPainTags,
  nicheSuggestions,
  PAIN_KEY_LABELS,
  type CompaniesByPainListOut,
  type PainKey,
  type PainTagOut,
} from '@/src/services/api/maps';

const PAIN_KEYS: PainKey[] = [
  'call_no_answer',
  'callback_lost',
  'schedule_hard',
  'schedule_wait',
  'queue_wait',
  'admin_rude',
  'unclear_pricing',
  'food_slow',
];

const PAGE_SIZE = 50;

export default function PainsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Загружаем…</div>}>
      <PainsPageInner />
    </Suspense>
  );
}

function PainsPageInner() {
  // URL query params: /app/pains?niche=X&city=Y — pre-fill фильтров
  // (нужно для навигации из /app/admin/data-inventory).
  const searchParams = useSearchParams();
  const initialNiche = searchParams?.get('niche') ?? '';
  const initialCity = searchParams?.get('city') ?? '';

  const [painKey, setPainKey] = useState<PainKey>('call_no_answer');
  const [selectedTag, setSelectedTag] = useState<PainTagOut | null>(null);
  const [city, setCity] = useState<string>(initialCity);
  const [niche, setNiche] = useState<string>(initialNiche);

  const [cities, setCities] = useState<string[]>([]);
  const [niches, setNiches] = useState<string[]>([]);

  const [data, setData] = useState<CompaniesByPainListOut | null>(null);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Топ-теги ниши для плитки (horizontal scroll)
  const [topTags, setTopTags] = useState<PainTagOut[]>([]);
  const [topTagsLoading, setTopTagsLoading] = useState(false);
  const tilesScrollRef = useRef<HTMLDivElement | null>(null);

  // Text-search по тегам ниши (заменяет ограничение 8 pain_keys)
  const [tagSearch, setTagSearch] = useState('');
  const [tagSearchOpen, setTagSearchOpen] = useState(false);

  // Батч «Добавить всех в список»
  const [addToListOpen, setAddToListOpen] = useState(false);
  // Выбранные компании чекбоксами (для батча в список)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Открытая карточка в drawer'е
  const [drawerCompanyId, setDrawerCompanyId] = useState<number | null>(null);

  // Суперюзерская кнопка «Пересобрать AI-теги»
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);

  useEffect(() => {
    listMapCities().then(setCities).catch(() => setCities([]));
    nicheSuggestions('').then(setNiches).catch(() => setNiches([]));
  }, []);

  // Автозапуск поиска при приходе из /admin/data-inventory с ?niche=&city=
  const autoRunRef = useRef(false);
  useEffect(() => {
    if (autoRunRef.current) return;
    if (!initialNiche && !initialCity) return;
    autoRunRef.current = true;
    // Один тик, чтобы state успел обновиться
    setTimeout(() => void runSearch(0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNiche, initialCity]);

  useEffect(() => {
    const cached = typeof window !== 'undefined'
      ? sessionStorage.getItem('is_superuser')
      : null;
    if (cached === 'true') {
      setIsSuperuser(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled && Boolean(body?.is_superuser)) {
          setIsSuperuser(true);
          try { sessionStorage.setItem('is_superuser', 'true'); } catch { /* no-op */ }
        }
      } catch { /* no-op */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Загружаем топ-теги при смене ниши. Без ниши — глобальный список
  // мгновенно перегружает страницу тысячей тегов, поэтому не показываем.
  useEffect(() => {
    if (!niche) {
      setTopTags([]);
      return;
    }
    let cancelled = false;
    setTopTagsLoading(true);
    listPainTags(niche, city || undefined)
      .then((tags) => {
        if (!cancelled) setTopTags(tags);
      })
      .catch(() => {
        if (!cancelled) setTopTags([]);
      })
      .finally(() => {
        if (!cancelled) setTopTagsLoading(false);
      });
    return () => { cancelled = true; };
  }, [niche, city]);

  // Автопрокрутка плитки — тонкий hint, что там ещё есть чего скроллить.
  // Мягкая анимация вправо-влево каждые 4с, пока юзер не потрогает.
  useEffect(() => {
    const el = tilesScrollRef.current;
    if (!el || topTags.length < 6) return;
    let userTouched = false;
    const onTouch = () => { userTouched = true; };
    el.addEventListener('mouseenter', onTouch, { once: true });
    el.addEventListener('wheel', onTouch, { once: true });
    el.addEventListener('touchstart', onTouch, { once: true });
    const interval = setInterval(() => {
      if (userTouched || !el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = (el.scrollLeft + 120) % (max + 120);
      el.scrollTo({ left: next > max ? 0 : next, behavior: 'smooth' });
    }, 4000);
    return () => {
      clearInterval(interval);
      el.removeEventListener('mouseenter', onTouch);
      el.removeEventListener('wheel', onTouch);
      el.removeEventListener('touchstart', onTouch);
    };
  }, [topTags.length]);

  const rebuildNiche = async () => {
    if (!niche) return;
    setRebuildBusy(true);
    setRebuildMsg(null);
    try {
      const params = new URLSearchParams({ niche, sentiment: 'negative' });
      if (city) params.set('city', city);
      const res = await fetch(
        `/api/v1/maps/admin/rebuild-pain-tags-for-niche?${params.toString()}`,
        { method: 'POST' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRebuildMsg(`Ошибка ${res.status}: ${body?.detail ?? 'см. консоль'}`);
        return;
      }
      if (body.queued) {
        setRebuildMsg(
          `Запустил AI-разметку для ${body.companies_queued_for_analyze} компаний. ` +
          `Подожди 5-8 минут и обнови страницу.`,
        );
      } else {
        setRebuildMsg(body.hint ?? 'В БД нет компаний с этой нишей.');
      }
    } catch (e) {
      setRebuildMsg(e instanceof Error ? e.message : 'Не удалось');
    } finally {
      setRebuildBusy(false);
    }
  };

  const runSearch = useMemo(
    () => async (nextOffset: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const params: Parameters<typeof listCompaniesByPain>[0] = {
          city: city || undefined,
          niche: niche || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        };
        if (selectedTag) {
          params.pain_tag_ids = [selectedTag.id];
        } else {
          params.pain_key = painKey;
        }
        const result = await listCompaniesByPain(params);
        setData(result);
        setOffset(nextOffset);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить компании');
        setData(null);
      } finally {
        setIsLoading(false);
      }
    },
    [painKey, city, niche, selectedTag],
  );

  // Клик по плитке → выбрать конкретный tag и запустить поиск
  const pickTag = (tag: PainTagOut) => {
    setSelectedTag(tag);
    setTagSearchOpen(false);
    setTagSearch('');
    // Триггер запроса через таймер, чтобы state успел обновиться
    setTimeout(() => void runSearch(0), 0);
  };

  const clearTagSelection = () => {
    setSelectedTag(null);
    setTagSearch('');
    setTimeout(() => void runSearch(0), 0);
  };

  // Отфильтрованный список для text-search dropdown
  const tagSearchResults = useMemo(() => {
    if (!tagSearch.trim()) return topTags.slice(0, 20);
    const q = tagSearch.toLowerCase();
    return topTags.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 20);
  }, [tagSearch, topTags]);

  // Заголовок «активной боли» в шапке (или plашка выбранной кастом-темы)
  const activePainLabel = selectedTag ? selectedTag.label : PAIN_KEY_LABELS[painKey];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-6 pt-4 sm:pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Поиск компаний по боли</h1>
        <p className="text-sm text-slate-500">
          Выбери одну боль клиентов, при желании — город и нишу. Увидишь всех, у кого эта
          боль реально всплывает в отзывах.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Боль</span>
            {selectedTag ? (
              <div className="flex items-center gap-2">
                <span
                  className="flex-1 truncate rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-sm text-rose-800"
                  title={selectedTag.label}
                >
                  {selectedTag.label}
                </span>
                <button
                  type="button"
                  onClick={clearTagSelection}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                  title="Сбросить конкретный тег и вернуться к общей категории"
                >
                  ×
                </button>
              </div>
            ) : (
              <select
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={painKey}
                onChange={(e) => setPainKey(e.target.value as PainKey)}
              >
                {PAIN_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {PAIN_KEY_LABELS[k]}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Город</span>
            <select
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">— любой —</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Ниша</span>
            <input
              list="pains-niche-list"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={niche}
              placeholder="салоны красоты, стома, ..."
              onChange={(e) => setNiche(e.target.value)}
            />
            <datalist id="pains-niche-list">
              {niches.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
        </div>

        {/* Text-search тегов внутри ниши. Combobox: input + результаты списком.
            Работает только когда niche задан — иначе поиск бы шёл по тысячам
            тегов из всех ниш, что бесполезно. */}
        {niche && (
          <div className="relative">
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => {
                setTagSearch(e.target.value);
                setTagSearchOpen(true);
              }}
              onFocus={() => setTagSearchOpen(true)}
              onBlur={() => setTimeout(() => setTagSearchOpen(false), 200)}
              placeholder={
                topTags.length > 0
                  ? `⌕ Найти боль в нише «${niche}» текстом (например: грязный, доплаты, невежливо)`
                  : 'Теги ниши ещё не загружены'
              }
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:bg-white focus:outline-none"
            />
            {tagSearchOpen && tagSearchResults.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {tagSearchResults.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickTag(t)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-rose-50"
                    >
                      <span className="truncate">{t.label}</span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {t.occurrences_count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runSearch(0)}
            disabled={isLoading}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {isLoading ? 'Ищу…' : 'Показать'}
          </button>
          {data && !isLoading && (
            <span className="text-sm text-slate-500">
              Найдено {data.total} компаний
              {data.pain_labels.length > 0 && !selectedTag && (
                <>
                  {' '}
                  · сматчилось {data.pain_labels.length} tag(ов):{' '}
                  <span className="text-slate-400" title={data.pain_labels.join(', ')}>
                    {data.pain_labels.slice(0, 3).join(', ')}
                    {data.pain_labels.length > 3 && ` +${data.pain_labels.length - 3}`}
                  </span>
                </>
              )}
            </span>
          )}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </section>

      {/* Плитка ТОП-БОЛЕЙ ниши. Показывается когда выбрана ниша и есть теги.
          Одна горизонтальная строка со скроллом (иначе 30+ тегов забьют пол-страницы).
          Автопрокрутка — только пока юзер не потрогал. */}
      {niche && topTags.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Топ-боли ниши{' '}
              <span className="text-slate-400 normal-case">
                — можно кликнуть, чтобы увидеть компании
              </span>
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {niche}{city ? ` · ${city}` : ''}
            </span>
          </div>
          <div
            ref={tilesScrollRef}
            className="flex gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:thin]"
          >
            {topTags.map((t) => {
              const active = selectedTag?.id === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => pickTag(t)}
                  className={
                    'group inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-all hover:-translate-y-px hover:shadow-sm ' +
                    (active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-400')
                  }
                  title={t.description ?? undefined}
                >
                  <span className="whitespace-nowrap">{t.label}</span>
                  <span
                    className={
                      'rounded px-1 text-[10.5px] ' +
                      (active
                        ? 'bg-white/20 text-white'
                        : 'bg-white/60 text-rose-700')
                    }
                  >
                    {t.occurrences_count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {niche && topTagsLoading && (
        <p className="text-xs text-slate-400 pl-1">Загружаем топ-боли ниши…</p>
      )}

      {data && data.items.length === 0 && !isLoading && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 space-y-3">
          {(city || niche) ? (
            <>
              <p>
                В этой комбинации (
                {[niche && `ниша «${niche}»`, city && `город «${city}»`].filter(Boolean).join(', ')}
                ) компаний с болью «{activePainLabel}» не найдено.
              </p>
              {data.pain_labels && data.pain_labels.length > 0 ? (
                <p className="text-xs text-slate-500">
                  В БД есть {data.pain_labels.length}{' '}
                  {data.pain_labels.length === 1 ? 'тег' : 'тегов'} с этой болью
                  {' '}({data.pain_labels.slice(0, 3).map((l) => `«${l}»`).join(', ')}
                  {data.pain_labels.length > 3 ? ', ...' : ''}), но ни одна из компаний
                  в этом фильтре их не имеет. Попробуй снять фильтр:
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Ни один тег с этой болью не размечен для этого гео/ниши. Возможно,
                  парсер ещё не разобрал очередь пилота — подожди 5–10 мин или
                  сними фильтр:
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {city && (
                  <button
                    type="button"
                    onClick={() => {
                      setCity('');
                      void runSearch(0);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    × Убрать город «{city}»
                  </button>
                )}
                {niche && (
                  <button
                    type="button"
                    onClick={() => {
                      setNiche('');
                      void runSearch(0);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    × Убрать нишу «{niche}»
                  </button>
                )}
                {(city && niche) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCity('');
                      setNiche('');
                      void runSearch(0);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    × Убрать оба фильтра
                  </button>
                )}
              </div>
              {isSuperuser && niche && (
                <div className="pt-2 mt-2 border-t border-slate-200 space-y-1">
                  <button
                    type="button"
                    onClick={rebuildNiche}
                    disabled={rebuildBusy}
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    title="Только для суперюзера"
                  >
                    {rebuildBusy
                      ? 'Ставлю в очередь…'
                      : `⚙ Пересобрать AI-теги для «${niche}»${city ? ` / ${city}` : ''}`}
                  </button>
                  {rebuildMsg && (
                    <p className="text-[11px] text-slate-600">{rebuildMsg}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center space-y-1">
              <p>
                Компаний с болью «{activePainLabel}» нет в БД.
              </p>
              <p className="text-xs text-slate-500">
                {data.pain_labels && data.pain_labels.length > 0
                  ? `Теги есть (${data.pain_labels.length}), но ни одна компания не связана с ними — редкий случай, напиши админу.`
                  : 'Пилот парсинга ещё не разобрал эту тему, либо AI действительно её не выделил в отзывах. Запусти новый поиск в «Лиды → По картам» или подожди 5–10 мин.'}
              </p>
            </div>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          {/* Батч-панель: суммарная строка + чекбокс «выбрать всех видимых» +
              кнопка добавить в список (выбранных, а если ничего не выбрано —
              всех текущей страницы). */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-3 text-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={
                    data.items.length > 0 &&
                    data.items.every((c) => selectedIds.has(c.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(
                        (prev) => new Set([...prev, ...data.items.map((c) => c.id)]),
                      );
                    } else {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        data.items.forEach((c) => next.delete(c.id));
                        return next;
                      });
                    }
                  }}
                  className="h-4 w-4 accent-rose-600"
                />
                <span className="text-xs">Выбрать всех видимых</span>
              </label>
              <span className="text-xs text-slate-500">
                {data.total} {data.total === 1 ? 'компания' : 'компаний'} · выбрано{' '}
                <b className="text-slate-800">{selectedIds.size}</b>
              </span>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                >
                  × Сбросить
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAddToListOpen(true)}
              disabled={selectedIds.size === 0 && data.items.length === 0}
              className="rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
            >
              + Добавить в список
              {selectedIds.size > 0
                ? ` (${selectedIds.size} выбранных)`
                : ` (${data.items.length} видимых)`}
            </button>
          </div>

          <div className="grid gap-3">
            {data.items.map((c) => {
              const isSelected = selectedIds.has(c.id);
              return (
                <article
                  key={c.id}
                  onClick={(e) => {
                    // Клик по чекбоксу/ссылке/кнопке — не открывать drawer
                    const t = e.target as HTMLElement;
                    if (t.closest('a, button, input, label')) return;
                    setDrawerCompanyId(c.id);
                  }}
                  className={
                    'group cursor-pointer rounded-xl border p-4 shadow-sm hover:shadow-md transition-all ' +
                    (isSelected
                      ? 'border-rose-300 bg-rose-50/40 ring-2 ring-rose-200'
                      : 'border-slate-200 bg-white')
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 accent-rose-600"
                        title={isSelected ? 'Убрать из выбора' : 'Добавить в выбор'}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <h3 className="text-base font-semibold text-slate-900 truncate group-hover:text-rose-800">
                            {c.name}
                          </h3>
                          {c.niche && <span className="text-xs text-slate-500">{c.niche}</span>}
                          {c.city && (
                            <span className="text-xs text-slate-500">· {c.city}</span>
                          )}
                        </div>
                        {c.address && (
                          <div className="mt-0.5 text-xs text-slate-500 truncate">{c.address}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
                      {c.rating !== null && (
                        <span>
                          ★ {c.rating.toFixed(1)}{' '}
                          <span className="text-slate-400">/ {c.reviews_count} отз.</span>
                        </span>
                      )}
                      {c.lead_temperature !== null && (
                        <span
                          className={
                            c.lead_temperature >= 70
                              ? 'font-medium text-rose-600'
                              : c.lead_temperature >= 40
                              ? 'font-medium text-amber-600'
                              : 'text-slate-400'
                          }
                        >
                          🔥 {c.lead_temperature}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
                      {activePainLabel} · {c.pain_mention_count} упом.
                    </span>
                    {c.reviews_negative_count > 0 && (
                      <span className="text-slate-500">
                        Негатив: {c.reviews_negative_count}
                      </span>
                    )}
                    {c.phone && <span className="text-slate-500">{c.phone}</span>}
                    {c.website && (
                      <a
                        href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-600 underline underline-offset-2"
                      >
                        {c.website}
                      </a>
                    )}
                  </div>

                  {c.top_quote && (
                    <blockquote className="mt-2 border-l-2 border-rose-300 bg-rose-50/40 px-3 py-1 text-xs italic text-slate-700">
                      «{c.top_quote}»
                    </blockquote>
                  )}

                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className="text-slate-500 italic">
                      Клик по карточке — открыть детали →
                    </span>
                    <Link
                      href={`/app/leads?company=${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto text-slate-600 underline underline-offset-2 hover:text-slate-900"
                    >
                      Открыть в «Лидах» →
                    </Link>
                  </div>
                </article>
              );
            })}

            {(data.total > offset + data.items.length || offset > 0) && (
              <div className="flex items-center justify-center gap-3 pt-2 pb-6">
                <button
                  type="button"
                  disabled={offset === 0 || isLoading}
                  onClick={() => void runSearch(Math.max(0, offset - PAGE_SIZE))}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  ← Назад
                </button>
                <span className="text-xs text-slate-500">
                  {offset + 1}–{offset + data.items.length} из {data.total}
                </span>
                <button
                  type="button"
                  disabled={offset + data.items.length >= data.total || isLoading}
                  onClick={() => void runSearch(offset + PAGE_SIZE)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  Дальше →
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <AddToListModal
        open={addToListOpen}
        companyIds={
          selectedIds.size > 0
            ? Array.from(selectedIds)
            : (data?.items.map((c) => c.id) ?? [])
        }
        defaultListName={
          data
            ? `Боль «${activePainLabel}»${niche ? ` — ${niche}` : ''}${city ? ` / ${city}` : ''}`
            : undefined
        }
        onClose={() => setAddToListOpen(false)}
        onDone={() => {
          setAddToListOpen(false);
          setSelectedIds(new Set());
        }}
      />

      {/* Detail drawer — открывается кликом по карточке. searchId=null:
          drawer работает без контекста поиска, «Найти ЛПР» и source-retry
          не показываются. */}
      <MapsCompanyDetailDrawer
        companyId={drawerCompanyId}
        searchId={null}
        onClose={() => setDrawerCompanyId(null)}
      />
    </div>
  );
}
