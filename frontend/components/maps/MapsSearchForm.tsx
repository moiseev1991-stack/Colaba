'use client';

/**
 * Форма создания поиска по картам — в стиле LegacyLeadsPanel («По сайтам»).
 *
 * Минимум: ниша + город + источники (2GIS / Яндекс.Карты).
 * Расширенные настройки: фильтры отзывов через FilterBuilder
 * (текст содержит / не содержит). Условия применяются в выдаче
 * /maps/search/{id}/companies через review_text_contains / _excludes.
 *
 * NB: backend сейчас понимает только два текстовых условия из FilterBuilder
 * (review_text contains / not_contains). Остальные операторы
 * (equals, starts_with) для отзывов не имеют смысла и не пробрасываются.
 */

import { useEffect, useState } from 'react';
import { BookmarkPlus, Loader2, Sparkles, ArrowRight, ChevronDown, ChevronRight, X } from 'lucide-react';

import { BUILTIN_PRESETS } from '@/components/maps/builtinPresets';
import { SaveFilterPresetModal } from '@/components/maps/SaveFilterPresetModal';
import { CityCombobox } from '@/components/CityCombobox';
import {
  FilterBuilder,
  emptyFilterSpec,
  type FieldDef,
  type FilterSpec,
} from '@/components/FilterBuilder';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  createMapSearch,
  type MapSearchFilter,
  type MapSearchOut,
  type MapSource,
} from '@/src/services/api/maps';
import {
  listUserPresets,
  type UserPresetOut,
} from '@/src/services/api/user-presets';

const NICHE_PRESETS: Array<{ label: string; cat: string }> = [
  // медицина / здоровье
  { label: 'стоматология', cat: 'медицина' },
  { label: 'косметология', cat: 'медицина' },
  { label: 'ветеринарная клиника', cat: 'медицина' },
  { label: 'фитнес клуб', cat: 'health' },
  { label: 'массажный салон', cat: 'health' },
  // авто
  { label: 'автосервис', cat: 'авто' },
  { label: 'шиномонтаж', cat: 'авто' },
  // строй / ремонт
  { label: 'ремонт квартир', cat: 'строй' },
  { label: 'натяжные потолки', cat: 'строй' },
  { label: 'окна пластиковые', cat: 'строй' },
  { label: 'строительные компании', cat: 'строй' },
  // услуги / быт
  { label: 'клининговая компания', cat: 'услуги' },
  { label: 'химчистка', cat: 'услуги' },
  { label: 'мастерская ключей', cat: 'услуги' },
  { label: 'грузоперевозки', cat: 'услуги' },
  { label: 'упаковка подарков', cat: 'услуги' },
  // красота
  { label: 'парикмахерская', cat: 'красота' },
  { label: 'барбершоп', cat: 'красота' },
  { label: 'маникюр', cat: 'красота' },
  { label: 'салон красоты', cat: 'красота' },
  // еда
  { label: 'доставка еды', cat: 'food' },
  { label: 'шаверма', cat: 'food' },
  { label: 'пиццерия', cat: 'food' },
  { label: 'кофейня', cat: 'food' },
  { label: 'суши доставка', cat: 'food' },
  // ритейл
  { label: 'доставка цветов', cat: 'ритейл' },
  { label: 'магазин подарков', cat: 'ритейл' },
  // B2B / профессиональные услуги
  { label: 'юридические услуги', cat: 'услуги' },
  { label: 'бухгалтерские услуги', cat: 'B2B' },
  { label: 'рекламное агентство', cat: 'B2B' },
  { label: 'веб-студия', cat: 'B2B' },
  // образование
  { label: 'школа английского', cat: 'обр.' },
  { label: 'детский центр', cat: 'обр.' },
];

// «Быстрый старт»: ниша + город сразу, один клик — поиск запущен.
// Для onboarding'а: новый пользователь не должен думать, что вбить.
// Подписи в hint — без обещаний по числу компаний (2GIS отдаёт от 10 до ~200
// в зависимости от ниши/города/времени). Прошлый «~50 компаний» оказался
// враньём — реальность отдавала 24, и доверие к продукту падало с первого
// клика. Лучше честно про тематику, чем точно про количество.
const QUICK_PRESETS: Array<{ niche: string; city: string; title: string; hint: string }> = [
  {
    niche: 'стоматология',
    city: 'Москва',
    title: 'Стоматологии Москвы',
    hint: 'клиники с реальными отзывами клиентов',
  },
  {
    niche: 'автосервис',
    city: 'Санкт-Петербург',
    title: 'Автосервисы СПб',
    hint: 'жалобы на сроки и цены',
  },
  {
    niche: 'фитнес клуб',
    city: 'Москва',
    title: 'Фитнес-клубы Москвы',
    hint: 'отзывы про инструкторов',
  },
  {
    niche: 'рестораны',
    city: 'Казань',
    title: 'Рестораны Казани',
    hint: 'жалобы на обслуживание',
  },
];

// Поля FilterBuilder для отзывов. Backend поддерживает только text/contains+not_contains.
// Остальные операторы (equals/starts_with) бессмысленны для отзывов и не передаются.
const REVIEW_FILTER_FIELDS: FieldDef[] = [
  {
    id: 'review_text',
    label: 'В тексте отзыва есть',
    kind: 'text',
    placeholder: 'Например: долго ждали',
  },
];

interface Props {
  /** aiPreset !== null означает: юзер выбрал свой пресет с непустым ai_prompt —
   *  Results-страница должна сразу активировать AI-плашку и автозапустить анализ
   *  как только выдача будет загружена. */
  onStarted: (search: MapSearchOut, aiPreset?: UserPresetOut | null) => void;
}

type SearchModeTab = 'city' | 'radius';

export function MapsSearchForm({ onStarted }: Props) {
  const [mode, setMode] = useState<SearchModeTab>('city');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('Москва');
  const [address, setAddress] = useState('');
  const [radiusKm, setRadiusKm] = useState(2);
  const [reviewWord, setReviewWord] = useState('');
  // 'contains' — должно быть в отзыве; 'excludes' — должно отсутствовать.
  const [reviewMode, setReviewMode] = useState<'contains' | 'excludes'>('contains');
  // Применённый пресет фильтров — летит в payload createMapSearch как filters,
  // дальше виден на странице результатов как сразу применённый фильтр.
  // null = пресет не выбран, дефолтный поиск без фильтрации.
  const [presetFilter, setPresetFilter] = useState<MapSearchFilter | null>(null);
  const [presetLabel, setPresetLabel] = useState<string | null>(null);
  // Если выбран user-пресет с непустым ai_prompt — храним его целиком, чтобы
  // прокинуть в onStarted и активировать AI-плашку сразу на странице результатов
  // (раньше юзеру приходилось второй раз кликать пресет в боковой панели).
  const [aiPreset, setAiPreset] = useState<UserPresetOut | null>(null);
  // Когда юзер выбрал встроенный пресет с готовым ai_prompt — храним промпт и
  // имя, чтобы предложить «сохранить как мой пресет с AI» одним кликом.
  // Сам встроенный preset_id'а не имеет → запустить AI-анализ напрямую нельзя.
  const [builtinAiPrompt, setBuiltinAiPrompt] = useState<{ name: string; prompt: string } | null>(null);
  const [userPresets, setUserPresets] = useState<UserPresetOut[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  // Для модалки «копировать встроенный с AI» — открываем её отдельно с
  // пред-заполненными default-полями.
  const [copyBuiltinModalOpen, setCopyBuiltinModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listUserPresets('maps', false); // только активные
        if (!cancelled) setUserPresets(list);
      } catch {
        // ignore — если не залогинен или сеть, форма должна работать без пресетов
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function applyBuiltinPreset(p: typeof BUILTIN_PRESETS[number]) {
    setPresetFilter(p.filter);
    setPresetLabel(p.label);
    // Встроенный пресет сам по себе не имеет preset_id и не может триггерить
    // AI-анализ напрямую. Но у некоторых встроенных есть рекомендованный
    // ai_prompt — показываем юзеру предложение «сохранить как мой пресет с AI».
    setAiPreset(null);
    setBuiltinAiPrompt(
      p.ai_prompt && p.ai_prompt.trim()
        ? { name: `${p.label} + AI`, prompt: p.ai_prompt }
        : null,
    );
  }

  function applyUserPreset(p: UserPresetOut) {
    setPresetFilter(p.filter as MapSearchFilter);
    setPresetLabel(p.name);
    setAiPreset(p.ai_prompt && p.ai_prompt.trim() ? p : null);
    setBuiltinAiPrompt(null);
  }

  function clearPreset() {
    setPresetFilter(null);
    setPresetLabel(null);
    setAiPreset(null);
    setBuiltinAiPrompt(null);
  }
  const [sources, setSources] = useState<MapSource[]>(['2gis']);
  const [filterSpec, setFilterSpec] = useState<FilterSpec>(emptyFilterSpec);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSource(s: MapSource) {
    setSources((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function handlePreset(label: string) {
    setNiche(label);
  }

  // Превращаем форму в MapSearchFilter.
  // Источники полей:
  //  1) presetFilter — если юзер кликнул пресет (готовый или свой)
  //  2) reviewWord + reviewMode — поле через запятую под нишей/адресом
  //  3) FilterBuilder из «расширенных настроек»
  // Все три источника МЕРЖАТСЯ. Слова из пресета и из reviewWord складываются
  // (если оба заданы и в одном режиме). Числовые/булевы поля из пресета
  // имеют приоритет — юзер их видит только косвенно («применён пресет: X»).
  function buildFilters(): MapSearchFilter | null {
    const words = reviewWord
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const containsFromBuilder = filterSpec.conditions.find(
      (c) => c.field === 'review_text' && c.op === 'contains' && c.value.trim()
    );
    const notContains = filterSpec.conditions.find(
      (c) => c.field === 'review_text' && c.op === 'not_contains' && c.value.trim()
    );

    const containsAny: string[] = [];
    const excludesAny: string[] = [];
    if (reviewMode === 'contains') containsAny.push(...words);
    else excludesAny.push(...words);
    if (containsFromBuilder?.value.trim()) containsAny.push(containsFromBuilder.value.trim());
    if (notContains?.value.trim()) excludesAny.push(notContains.value.trim());
    // Дополняем словами из пресета (если есть)
    if (presetFilter?.review_text_contains_any?.length) {
      containsAny.push(...presetFilter.review_text_contains_any);
    }
    if (presetFilter?.review_text_contains) {
      containsAny.push(presetFilter.review_text_contains);
    }
    if (presetFilter?.review_text_excludes_any?.length) {
      excludesAny.push(...presetFilter.review_text_excludes_any);
    }
    if (presetFilter?.review_text_excludes) {
      excludesAny.push(presetFilter.review_text_excludes);
    }

    // Числовые/булевы фильтры — только из пресета (форма поиска их не
    // редактирует напрямую).
    const merged: MapSearchFilter = {
      ...(presetFilter ?? {}),
      review_text_contains: null,
      review_text_excludes: null,
      review_text_contains_any: containsAny.length ? Array.from(new Set(containsAny)) : null,
      review_text_excludes_any: excludesAny.length ? Array.from(new Set(excludesAny)) : null,
    };

    const hasAny =
      merged.min_rating != null ||
      merged.max_rating != null ||
      merged.min_reviews != null ||
      merged.min_negative != null ||
      merged.has_owner_replies != null ||
      merged.has_website != null ||
      (merged.review_text_contains_any?.length ?? 0) > 0 ||
      (merged.review_text_excludes_any?.length ?? 0) > 0 ||
      !!merged.sort_by;
    return hasAny ? merged : null;
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (niche.trim().length < 2) {
      setError('Ниша слишком короткая (минимум 2 символа)');
      return;
    }
    if (sources.length === 0) {
      setError('Выбери хотя бы один источник');
      return;
    }
    if (mode === 'radius') {
      if (address.trim().length < 3) {
        setError('Введи адрес для радиуса (минимум 3 символа)');
        return;
      }
      if (sources[0] !== '2gis' || sources.length > 1) {
        setError('Конкурентный режим (радиус) пока работает только для 2GIS');
        return;
      }
    }
    setIsLoading(true);
    try {
      const filters = buildFilters();
      const payload =
        mode === 'radius'
          ? {
              niche: niche.trim(),
              city: '',
              sources,
              mode: 'radius' as const,
              address: address.trim(),
              radius_meters: Math.round(radiusKm * 1000),
              ...(filters ? { filters } : {}),
            }
          : {
              niche: niche.trim(),
              city: city.trim() || 'Москва',
              sources,
              ...(filters ? { filters } : {}),
            };
      const search = await createMapSearch(payload);
      onStarted(search, aiPreset);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ||
        (err as { message?: string })?.message ||
        'Не удалось создать поиск';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function runQuickPreset(preset: { niche: string; city: string }) {
    setNiche(preset.niche);
    setCity(preset.city);
    setError(null);
    setIsLoading(true);
    try {
      const search = await createMapSearch({
        niche: preset.niche,
        city: preset.city,
        sources: ['2gis'],
      });
      // Quick-presets — это просто ниша+город, без фильтров и AI.
      onStarted(search, null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ||
        (err as { message?: string })?.message ||
        'Не удалось запустить пресет';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  const isReady = niche.trim().length >= 2 && sources.length > 0;
  const displayedPresets = showAllPresets ? NICHE_PRESETS : NICHE_PRESETS.slice(0, 6);

  return (
    // На мобиле было px-6 → горизонтальные 48px + внутренние padding'и
    // карточки p-6 = ещё 48px съедали ширину 390px, поля и заголовки
    // обрезались. На <sm даём px-3, на sm+ возвращаем px-6.
    <div className="mx-auto max-w-[1200px] w-full px-3 sm:px-6 py-6 sm:py-10 relative z-10">
      {/* === QUICK START PRESETS === */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
            быстрый старт — один клик
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {QUICK_PRESETS.map((p) => (
            <button
              key={`${p.niche}-${p.city}`}
              type="button"
              onClick={() => runQuickPreset(p)}
              disabled={isLoading}
              className="group flex flex-col items-start gap-1 rounded-md border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-slate-900">{p.title}</span>
              <span className="text-[12px] text-slate-500">{p.hint}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 group-hover:text-slate-900">
                Запустить <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Компактный заголовок (без лендингового hero — юзер в кабинете). */}
      <section className="mb-6 app-reveal">
        <h1
          className="font-display font-semibold tracking-tight"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
        >
          Поиск лидов
        </h1>
        <p className="mt-1 text-sm max-w-[640px]" style={{ color: 'hsl(var(--muted))' }}>
          Введите нишу и город — модуль найдёт компании в 2GIS / Яндекс.Картах,
          подтянет отзывы и выделит «боли» клиентов.
        </p>
      </section>

      {/* === LAUNCH PANEL === */}
      <section className="app-hero-card app-reveal app-reveal-delay-1">
        {/* Меньший padding на мобиле — иначе суммарно 24+24 px по бокам
            съедало уже узкие 390px и текст обрезался. */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 md:p-8">
          <div
            className="flex flex-wrap items-center justify-between gap-2 mb-6 pb-5 border-b"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="app-step-num app-step-num-active shrink-0">02</span>
              <div className="min-w-0">
                <h2 className="text-[18px] font-bold leading-tight" style={{ color: 'hsl(var(--text))' }}>
                  Параметры поиска
                </h2>
                <p className="text-[12px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
                  Ниша и город — обязательны. Остальное — по желанию.
                </p>
              </div>
            </div>
            <span className="app-mono-label hidden md:inline" style={{ color: 'hsl(var(--muted))' }}>
              ~ 1-2 мин до выдачи
            </span>
          </div>

          {/* Mode switcher — flex-wrap для случая когда кнопки не влезают */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode('city')}
              disabled={isLoading}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                mode === 'city'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              По городу
            </button>
            <button
              type="button"
              onClick={() => setMode('radius')}
              disabled={isLoading}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                mode === 'radius'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              )}
              title="Конкурентный режим: компании в радиусе X км от заданного адреса"
            >
              По радиусу <span className="ml-1 rounded-sm bg-[var(--signal-warm)]/40 px-1.5 text-[10px] text-[color:var(--signal-warm)]">new</span>
            </button>
          </div>

          {/* Form row */}
          <div className="grid gap-4 md:grid-cols-12 mb-5">
            <div className="md:col-span-6">
              <label className="block app-mono-label mb-2" style={{ color: 'hsl(var(--muted))' }}>
                ниша / запрос
              </label>
              <Input
                type="text"
                placeholder="Например: стоматология"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={isLoading}
                className="w-full h-11 text-[15px]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </div>
            {mode === 'city' ? (
              <div className="md:col-span-6">
                <label className="block app-mono-label mb-2" style={{ color: 'hsl(var(--muted))' }}>
                  город
                </label>
                <CityCombobox
                  city={city}
                  onCityChange={(c) => setCity(c)}
                  disabled={isLoading}
                  className="w-full"
                  placeholder="Выберите город"
                />
              </div>
            ) : (
              <>
                <div className="md:col-span-6">
                  <label className="block app-mono-label mb-2" style={{ color: 'hsl(var(--muted))' }}>
                    адрес центра поиска
                  </label>
                  <Input
                    type="text"
                    placeholder="Например: Москва, ул. Тверская, 1"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={isLoading}
                    className="w-full h-11 text-[15px]"
                  />
                </div>
                <div className="md:col-span-12">
                  <label className="block app-mono-label mb-2 flex items-center justify-between" style={{ color: 'hsl(var(--muted))' }}>
                    <span>радиус поиска</span>
                    <span style={{ color: 'hsl(var(--text))' }}>{radiusKm.toFixed(1)} км</span>
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
                    disabled={isLoading}
                    className="w-full"
                  />
                  <p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
                    Найдём компании в радиусе {radiusKm.toFixed(1)} км от точки. Удобно для
                    конкурентной разведки — «что у моих соседей по району».
                  </p>
                </div>
              </>
            )}
            <div className="md:col-span-12">
              <label className="block app-mono-label mb-2" style={{ color: 'hsl(var(--muted))' }}>
                слова в отзывах — необязательно
              </label>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setReviewMode('contains')}
                  disabled={isLoading}
                  className={cn(
                    'rounded-md border px-3 py-1 text-[12px] font-medium transition-colors',
                    reviewMode === 'contains'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  Содержит
                </button>
                <button
                  type="button"
                  onClick={() => setReviewMode('excludes')}
                  disabled={isLoading}
                  className={cn(
                    'rounded-md border px-3 py-1 text-[12px] font-medium transition-colors',
                    reviewMode === 'excludes'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  Не содержит
                </button>
              </div>
              <Input
                type="text"
                placeholder={
                  reviewMode === 'contains'
                    ? 'Например: долго ждал, грязно, не дозвонился'
                    : 'Например: отлично, рекомендую, превосходно'
                }
                value={reviewWord}
                onChange={(e) => setReviewWord(e.target.value)}
                disabled={isLoading}
                className="w-full h-11 text-[15px]"
              />
              <p className="mt-1.5 text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
                Несколько слов через запятую — между ними <strong>ИЛИ</strong>.
                {reviewMode === 'contains' ? (
                  <>
                    {' '}В выдаче останутся компании, у которых есть отзыв с любым из этих
                    слов. Пример: «ДТП» в нише «юр.услуги» → автоюристы.
                  </>
                ) : (
                  <>
                    {' '}В выдаче пропадут компании, у которых хоть один отзыв содержит
                    любое из этих слов. Пример: исключить «реклама», «спам».
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Filter presets — встроенные + мои */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                пресет фильтров (необязательно)
              </p>
              <div className="flex items-center gap-2">
                {presetLabel && (
                  <button
                    type="button"
                    onClick={clearPreset}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    <X className="h-3 w-3" /> убрать
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(true)}
                  title="Сохранить текущие фильтры как пресет"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-50"
                >
                  <BookmarkPlus className="h-3 w-3" /> сохранить
                </button>
              </div>
            </div>
            {presetLabel && (
              <div className="mb-2 rounded-v2-sm border border-[color:var(--signal-good)]/30 bg-[var(--signal-good-bg)] px-2 py-1 text-[12px] text-[color:var(--signal-good)]">
                Применён: <strong>{presetLabel}</strong> — применится к выдаче сразу после поиска.
                {aiPreset && (
                  <span className="ml-1 inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0 text-[11px] font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                    <Sparkles className="h-3 w-3" /> AI-анализ запустится автоматически
                  </span>
                )}
              </div>
            )}
            {builtinAiPrompt && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-violet-200 bg-violet-50/50 px-2 py-1.5 text-[12px] text-violet-900 dark:border-violet-700/50 dark:bg-violet-900/30 dark:text-violet-200">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  У этого пресета есть готовый AI-промпт — сохрани как свой, чтобы запустить анализ
                </span>
                <button
                  type="button"
                  onClick={() => setCopyBuiltinModalOpen(true)}
                  className="rounded-md bg-violet-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-violet-700"
                >
                  Сохранить как мой пресет с AI
                </button>
              </div>
            )}
            {/* На mobile (<sm) — горизонтальный скролл одним рядом, чипы не
                переносятся (иначе занимают пол-экрана). На sm+ — обычный wrap. */}
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0">
              {BUILTIN_PRESETS.map((p) => {
                const active = presetLabel === p.label;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyBuiltinPreset(p)}
                    title={p.description}
                    className={cn(
                      'flex shrink-0 flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors sm:shrink',
                      active
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                        : 'border-slate-300 bg-white hover:border-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'
                    )}
                  >
                    <span className="text-[12px] font-medium text-slate-800">{p.label}</span>
                    <span className="text-[10px] leading-tight text-slate-500">{p.shortHint}</span>
                  </button>
                );
              })}
              {userPresets.map((p) => {
                const active = presetLabel === p.name;
                const hasAi = !!(p.ai_prompt && p.ai_prompt.trim());
                return (
                  <button
                    key={`u-${p.id}`}
                    type="button"
                    onClick={() => applyUserPreset(p)}
                    title={p.description ?? (hasAi ? 'мой пресет с AI-анализом' : 'мой пресет')}
                    className={cn(
                      'flex shrink-0 flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors sm:shrink',
                      active
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-brand-200 bg-brand-50/40 hover:border-brand-400'
                    )}
                  >
                    <span className="text-[12px] font-medium text-slate-800">
                      {p.name}
                      {hasAi && (
                        <span className="ml-1 inline-flex items-center rounded bg-violet-100 px-1 py-0 text-[9px] font-semibold text-violet-800">
                          AI
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] leading-tight text-emerald-700/80">мой</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Niche presets */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                популярные ниши
              </p>
              <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                {showAllPresets ? NICHE_PRESETS.length : Math.min(6, NICHE_PRESETS.length)} / {NICHE_PRESETS.length}
              </span>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0">
              {displayedPresets.map((p) => {
                const active = niche === p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handlePreset(p.label)}
                    className={cn('app-chip group shrink-0 sm:shrink', active && 'app-chip-active')}
                  >
                    <span>{p.label}</span>
                    <span
                      className={cn('app-bracket-tag', active && 'opacity-90')}
                      style={{ color: active ? 'rgba(255,255,255,0.85)' : undefined }}
                    >
                      {p.cat}
                    </span>
                  </button>
                );
              })}
              {NICHE_PRESETS.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllPresets(!showAllPresets)}
                  className="app-chip"
                  style={{ color: 'hsl(var(--accent))', fontWeight: 600 }}
                >
                  {showAllPresets ? '— Свернуть' : `+ ${NICHE_PRESETS.length - 6} ещё`}
                </button>
              )}
            </div>
          </div>

          {/* Sources */}
          <div className="mb-6">
            <p className="app-mono-label mb-2" style={{ color: 'hsl(var(--muted))' }}>
              источники
            </p>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  { id: '2gis' as MapSource, name: '2GIS', hint: 'основной, работает' },
                  { id: 'yandex_maps' as MapSource, name: 'Яндекс.Карты', hint: 'нужен прокси' },
                ]
              ).map((s) => {
                const checked = sources.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-[13px] transition-colors',
                      checked ? 'border-brand-500 bg-brand-500/10' : 'border-[hsl(var(--border))] hover:border-brand-400'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSource(s.id)}
                      disabled={isLoading}
                      className="w-4 h-4"
                      style={{ accentColor: 'hsl(var(--accent))' }}
                    />
                    <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{s.name}</span>
                    <span className="app-bracket-tag" style={{ color: 'hsl(var(--muted))' }}>
                      {s.hint}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Advanced settings */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="inline-flex items-center gap-1.5 app-mono-label hover:text-[hsl(var(--accent))] transition-colors"
              style={{ color: 'hsl(var(--muted))' }}
            >
              {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              расширенные настройки
            </button>
            {advancedOpen && (
              <div
                className="mt-3 grid gap-4 p-4"
                style={{
                  background: 'hsl(var(--surface-2) / 0.5)',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 4,
                }}
              >
                <p className="text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
                  Фильтры применяются к выдаче — компания пройдёт, только если у неё есть отзывы,
                  удовлетворяющие условиям.
                </p>
                <FilterBuilder
                  value={filterSpec}
                  onChange={setFilterSpec}
                  disabled={isLoading}
                  fields={REVIEW_FILTER_FIELDS}
                  emptyHint='Добавьте условие — например, «В тексте отзыва есть содержит долго ждали».'
                  defaultTextPlaceholder="Например: долго ждали"
                />
              </div>
            )}
          </div>

          {error && (
            <div
              className="mb-5 rounded-md px-3 py-2 text-[13px]"
              style={{
                color: 'hsl(var(--danger))',
                background: 'hsl(var(--danger) / 0.1)',
                border: '1px solid hsl(var(--danger) / 0.3)',
              }}
            >
              {error}
            </div>
          )}

          {/* CTA */}
          <div
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-5 border-t"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <button
              type="submit"
              disabled={!isReady || isLoading}
              className="app-cta-mega w-full sm:w-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Запуск…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Найти компании <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <div className="text-[13px] flex-1 leading-snug" style={{ color: 'hsl(var(--muted))' }}>
              {isReady ? (
                <>
                  <span className="app-mono-label" style={{ color: 'hsl(var(--accent))' }}>
                    →
                  </span>{' '}
                  Спарсим <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{niche.trim()}</span>
                  {mode === 'radius' ? (
                    <>
                      {' '}в радиусе{' '}
                      <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{radiusKm.toFixed(1)} км</span>
                      {address.trim() && (
                        <>
                          {' '}от{' '}
                          <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{address.trim()}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {' '}в{' '}
                      <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{city || 'Москве'}</span>
                    </>
                  )}{' '}
                  через {sources.map((s) => (s === '2gis' ? '2GIS' : 'Яндекс.Карты')).join(' + ')}
                </>
              ) : (
                <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                  {mode === 'radius'
                    ? 'введите нишу и адрес центра'
                    : 'введите нишу — минимум 2 символа'}
                </span>
              )}
            </div>
          </div>
        </form>
      </section>

      <SaveFilterPresetModal
        open={saveModalOpen}
        filter={buildFilters() ?? {}}
        onClose={() => setSaveModalOpen(false)}
        onSaved={(p) => setUserPresets((prev) => [p, ...prev])}
      />

      {builtinAiPrompt && (
        <SaveFilterPresetModal
          open={copyBuiltinModalOpen}
          filter={presetFilter ?? {}}
          defaultName={builtinAiPrompt.name}
          defaultAiPrompt={builtinAiPrompt.prompt}
          onClose={() => setCopyBuiltinModalOpen(false)}
          onSaved={(p) => {
            setUserPresets((prev) => [p, ...prev]);
            // Сразу применяем созданный пресет к форме — AI-плашка
            // активируется на странице результатов.
            applyUserPreset(p);
            setCopyBuiltinModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
