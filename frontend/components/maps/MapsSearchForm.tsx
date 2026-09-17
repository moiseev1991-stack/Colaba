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
import { useIsSuperuser } from '@/lib/useIsSuperuser';
import { ArrowRight, Check, ChevronDown, Info, Plus } from 'lucide-react';

import { BUILTIN_PRESETS } from '@/components/maps/builtinPresets';
import { SaveFilterPresetModal } from '@/components/maps/SaveFilterPresetModal';
import { CityCombobox } from '@/components/CityCombobox';
import {
  FilterBuilder,
  emptyFilterSpec,
  type FieldDef,
  type FilterSpec,
} from '@/components/FilterBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { SearchHero } from '@/components/search/SearchHero';
import { cn } from '@/lib/utils';
import {
  createMapSearch,
  type MapSearchFilter,
  type MapSearchOut,
  type MapSource,
} from '@/src/services/api/maps';
import { listUserPresets, type UserPresetOut } from '@/src/services/api/user-presets';

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
    title: 'Стоматологии',
    hint: 'клиники с отзывами клиентов',
  },
  {
    niche: 'автосервис',
    city: 'Санкт-Петербург',
    title: 'Автосервисы',
    hint: 'жалобы на сроки и цены',
  },
  { niche: 'фитнес клуб', city: 'Москва', title: 'Фитнес-клубы', hint: 'отзывы про инструкторов' },
  { niche: 'рестораны', city: 'Казань', title: 'Рестораны', hint: 'жалобы на обслуживание' },
];

const SOURCE_NAMES: Record<MapSource, string> = {
  '2gis': '2GIS',
  yandex_maps: 'Яндекс.Карты',
  google_maps: 'Google Maps',
};

// Технические пометки источников («нужен ключ», «платно») видит только суперюзер.
const SOURCE_OPTIONS: Array<{ id: MapSource; name: string; hint: string }> = [
  { id: '2gis', name: '2GIS', hint: 'нужен ключ' },
  { id: 'yandex_maps', name: 'Яндекс.Карты', hint: 'бесплатно, нужен прокси' },
  { id: 'google_maps', name: 'Google Maps', hint: 'SerpAPI · платно' },
];

const HOW_IT_WORKS = [
  { title: 'Собираем карточки', text: 'Компании с карт: название, адрес, рейтинг, телефон, сайт.' },
  { title: 'Читаем отзывы', text: 'AI группирует жалобы в боли с числом упоминаний и цитатой.' },
  { title: 'Готовим письмо', text: 'Черновик КП под конкретную боль — готов к отправке.' },
];

const HINT_NICHES = ['стоматология', 'автосервис', 'фитнес клуб'];

const LABEL = 'mb-1.5 block text-xs font-semibold text-ui-text-muted';
const HINT_CHIP =
  'rounded-full bg-ui-surface-2 px-3 py-1 text-xs text-ui-text-muted transition-colors hover:bg-ui-border hover:text-ui-text';
const PRESET_CHIP =
  'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-ui-border bg-ui-surface px-4 py-2 text-small font-semibold text-ui-text-muted shadow-raised transition-all hover:-translate-y-px hover:text-ui-text';
const PRESET_CHIP_ON = 'border-ui-text bg-ui-text text-ui-surface hover:text-ui-surface';

// Поля FilterBuilder для отзывов. Backend поддерживает только text/contains+not_contains.
// Остальные операторы (equals/starts_with) бессмысленны для отзывов и не передаются.
const REVIEW_FILTER_FIELDS: FieldDef[] = [
  {
    id: 'review_text',
    label: 'В тексте отзыва есть',
    kind: 'text',
    placeholder: 'Например: не перезвонили, грубость, обман',
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
  // Технические пометки источников («нужен прокси», «платно») — только суперюзеру.
  const isSuperuser = useIsSuperuser();
  const [mode, setMode] = useState<SearchModeTab>('city');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('Москва');
  // Multi-search MVP (ТЗ юзера 2026-06-08): доп. города и доп. ниши через
  // запятую. При submit с непустыми extra* — клиент создаёт N×M поисков
  // (по одному на пару city × niche). Без backend-миграций; все поиски
  // сразу попадают в /app/leads/history. Юзер перенаправляется в первый.
  const [extraCities, setExtraCities] = useState('');
  const [extraNiches, setExtraNiches] = useState('');
  const [multiSearchProgress, setMultiSearchProgress] = useState<string | null>(null);
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
  const [builtinAiPrompt, setBuiltinAiPrompt] = useState<{ name: string; prompt: string } | null>(
    null,
  );
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
    return () => {
      cancelled = true;
    };
  }, []);

  function applyBuiltinPreset(p: (typeof BUILTIN_PRESETS)[number]) {
    setPresetFilter(p.filter);
    setPresetLabel(p.label);
    // Встроенный пресет сам по себе не имеет preset_id и не может триггерить
    // AI-анализ напрямую. Но у некоторых встроенных есть рекомендованный
    // ai_prompt — показываем юзеру предложение «сохранить как мой пресет с AI».
    setAiPreset(null);
    setBuiltinAiPrompt(
      p.ai_prompt && p.ai_prompt.trim() ? { name: `${p.label} + AI`, prompt: p.ai_prompt } : null,
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
  const [sources, setSources] = useState<MapSource[]>(['yandex_maps']);
  const [filterSpec, setFilterSpec] = useState<FilterSpec>(emptyFilterSpec);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSource(s: MapSource) {
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
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
      (c) => c.field === 'review_text' && c.op === 'contains' && c.value.trim(),
    );
    const notContains = filterSpec.conditions.find(
      (c) => c.field === 'review_text' && c.op === 'not_contains' && c.value.trim(),
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
      setError('Укажите нишу — хотя бы 2 символа');
      document.getElementById('search-niche')?.focus();
      return;
    }
    if (sources.length === 0) {
      setError('Выберите хотя бы один источник');
      return;
    }
    if (mode === 'radius') {
      if (address.trim().length < 3) {
        setError('Введите адрес центра — хотя бы 3 символа');
        return;
      }
      if (sources[0] !== '2gis' || sources.length > 1) {
        setError('Конкурентный режим (радиус) пока работает только для 2GIS');
        return;
      }
    }
    setIsLoading(true);
    setMultiSearchProgress(null);
    try {
      const filters = buildFilters();

      // Multi-search режим: парсим extraCities и extraNiches через запятую,
      // строим N×M декартово произведение. Включается только для mode='city'
      // (для radius — нет смысла, у нас одна точка). Если extra пусты —
      // обычный single-search.
      const parseList = (s: string) =>
        s
          .split(/[,;\n]/)
          .map((x) => x.trim())
          .filter((x) => x.length >= 2);
      const niches =
        mode === 'radius'
          ? [niche.trim()]
          : [niche.trim(), ...parseList(extraNiches)].filter((v, i, a) => v && a.indexOf(v) === i);
      const cities =
        mode === 'radius'
          ? ['']
          : [city.trim() || 'Москва', ...parseList(extraCities)].filter(
              (v, i, a) => v && a.indexOf(v) === i,
            );
      const pairs: { niche: string; city: string }[] = [];
      for (const n of niches) {
        for (const c of cities) pairs.push({ niche: n, city: c });
      }

      if (mode === 'city' && pairs.length > 1) {
        // Multi: ставим все в очередь параллельно, перенаправляем на первый.
        setMultiSearchProgress(`Создаю ${pairs.length} поисков…`);
        let firstSearch: Awaited<ReturnType<typeof createMapSearch>> | null = null;
        let done = 0;
        const results = await Promise.allSettled(
          pairs.map((p) =>
            createMapSearch({
              niche: p.niche,
              city: p.city,
              sources,
              ...(filters ? { filters } : {}),
            }).then((r) => {
              done += 1;
              setMultiSearchProgress(`Создал ${done} из ${pairs.length}…`);
              return r;
            }),
          ),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') {
            firstSearch = firstSearch ?? r.value;
          }
        }
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          setError(
            `${failed} из ${pairs.length} поисков не создались. Остальные открыты в /app/leads/history.`,
          );
        }
        setMultiSearchProgress(null);
        if (firstSearch) {
          onStarted(firstSearch, aiPreset);
        }
        return;
      }

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
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
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
        sources: ['yandex_maps'],
      });
      // Quick-presets — это просто ниша+город, без фильтров и AI.
      onStarted(search, null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (err as { message?: string })?.message ||
        'Не удалось запустить пресет';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  const isReady = niche.trim().length >= 2 && sources.length > 0;
  // Под полем — три коротких примера, остальные по «ещё».
  const hintNiches = showAllPresets
    ? NICHE_PRESETS
    : NICHE_PRESETS.filter((p) => HINT_NICHES.includes(p.label));
  const extraCount =
    [extraNiches, extraCities].filter((v) => v.trim()).length + filterSpec.conditions.length;

  function switchMode(next: SearchModeTab) {
    setMode(next);
    // Поиск в радиусе пока работает только через 2GIS — выбираем его сразу, а не ругаемся при запуске.
    if (next === 'radius') setSources(['2gis']);
  }

  const reviewToggle = (value: 'contains' | 'excludes', label: string) => (
    <button
      type="button"
      aria-pressed={reviewMode === value}
      onClick={() => setReviewMode(value)}
      disabled={isLoading}
      className={cn(
        'rounded-full border px-4 py-1.5 text-small font-semibold transition-colors',
        reviewMode === value
          ? value === 'contains'
            ? 'border-ui-accent bg-ui-accent/[.06] text-ui-accent'
            : 'border-ui-danger bg-ui-danger/[.06] text-ui-danger'
          : 'border-ui-border text-ui-text-muted hover:text-ui-text',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[1232px] px-4 sm:px-6">
      {/* === Первый экран: заголовок и форма === */}
      <div className="mx-auto w-full max-w-[1072px] pt-10 text-center sm:pt-16">
        <SearchHero
          active="maps"
          eyebrow="Отзывы с трёх карт — 2GIS, Яндекс и Google"
          title="Кому писать первым."
          dim="Подскажут отзывы клиентов."
        >
          Укажите нишу и город — соберём компании с карт, прочитаем отзывы и покажем,{' '}
          <b className="font-semibold text-ui-text">на что жалуются клиенты</b> каждой компании.
        </SearchHero>

        <form
          onSubmit={handleSubmit}
          aria-label="Параметры поиска"
          className="mx-auto mt-4 w-full max-w-[880px] rounded-panel border border-black/[.06] bg-ui-surface p-5 text-left shadow-floating sm:p-7"
        >
          <div className="grid gap-4 sm:grid-cols-[1.25fr_1fr]">
            <div className="min-w-0">
              <label htmlFor="search-niche" className={LABEL}>
                Ниша или вид бизнеса
              </label>
              <Input
                id="search-niche"
                type="text"
                placeholder="Например: стоматология"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={isLoading}
                className="h-12 text-base font-medium"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hintNiches.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handlePreset(p.label)}
                    className={cn(
                      HINT_CHIP,
                      niche === p.label &&
                        'bg-ui-text text-ui-surface hover:bg-ui-text hover:text-ui-surface',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowAllPresets(!showAllPresets)}
                  className={cn(HINT_CHIP, 'font-semibold text-ui-accent')}
                >
                  {showAllPresets ? 'свернуть' : `+${NICHE_PRESETS.length - HINT_NICHES.length}`}
                </button>
              </div>
            </div>

            {mode === 'city' ? (
              <div className="min-w-0">
                <label htmlFor="search-city" className={LABEL}>
                  Город
                </label>
                <CityCombobox
                  id="search-city"
                  city={city}
                  onCityChange={(c) => setCity(c)}
                  disabled={isLoading}
                  triggerClassName="h-12"
                  placeholder="Выберите город"
                />
                <p className="mt-2 text-xs text-ui-text-muted">
                  Несколько городов сразу — в «Тонкой настройке»
                </p>
              </div>
            ) : (
              <div className="min-w-0">
                <label htmlFor="search-address" className={LABEL}>
                  Адрес центра
                </label>
                <Input
                  id="search-address"
                  type="text"
                  placeholder="Москва, ул. Тверская, 1"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={isLoading}
                  className="h-12 text-base font-medium"
                />
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
                    disabled={isLoading}
                    aria-label="Радиус поиска, км"
                    className="min-w-0 flex-1 accent-[hsl(var(--color-accent))]"
                  />
                  <span className="w-14 text-right text-small font-semibold tabular-nums text-ui-accent">
                    {radiusKm.toFixed(1)} км
                  </span>
                </div>
              </div>
            )}
          </div>

          <div
            role="group"
            aria-label="Источники отзывов"
            className="mt-5 flex flex-wrap gap-2 border-t border-black/[.06] pt-5"
          >
            {SOURCE_OPTIONS.map((s) => {
              const checked = sources.includes(s.id);
              const lockedByRadius = mode === 'radius' && s.id !== '2gis';
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleSource(s.id)}
                  disabled={isLoading || lockedByRadius}
                  title={
                    lockedByRadius ? 'Поиск в радиусе пока работает только через 2GIS' : undefined
                  }
                  className={cn(
                    'inline-flex min-h-10 items-center gap-2 rounded-full border py-2 pl-2.5 pr-4 text-small font-semibold transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    checked
                      ? 'border-ui-accent bg-ui-accent/[.06] text-ui-text'
                      : 'border-ui-border text-ui-text-muted hover:border-ui-text-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-[18px] w-[18px] place-items-center rounded-full border-[1.5px] transition-colors',
                      checked
                        ? 'border-ui-accent bg-ui-accent text-ui-accent-contrast'
                        : 'border-ui-text-muted/40 text-transparent',
                    )}
                    aria-hidden
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {s.name}
                  {isSuperuser && (
                    <span className="text-xs font-medium text-ui-text-muted">{s.hint}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5 border-t border-black/[.06] pt-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label
                htmlFor="search-review-words"
                className="mr-1 text-xs font-semibold text-ui-text-muted"
              >
                Слова в отзывах — необязательно
              </label>
              {reviewToggle('contains', 'Содержит')}
              {reviewToggle('excludes', 'Не содержит')}
            </div>
            <Input
              id="search-review-words"
              placeholder={
                reviewMode === 'contains'
                  ? 'не дозвонился, не перезвонили, грязно'
                  : 'реклама, спам'
              }
              value={reviewWord}
              onChange={(e) => setReviewWord(e.target.value)}
              disabled={isLoading}
              className="h-11"
            />
            <p className="mt-1.5 text-xs text-ui-text-muted">
              Несколько слов через запятую — подходит любое.{' '}
              {reviewMode === 'contains'
                ? 'Останутся компании, у которых есть отзыв с одним из слов.'
                : 'Пропадут компании, у которых хоть один отзыв содержит одно из слов.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-control bg-ui-danger/10 px-3 py-2 text-small text-ui-danger"
            >
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button
              type="submit"
              disabled={isLoading}
              loading={isLoading}
              iconRight={!isLoading ? <ArrowRight /> : undefined}
              className="h-12 w-full px-7 text-base sm:w-auto"
            >
              {isLoading ? (multiSearchProgress ?? 'Запускаю…') : 'Найти компании'}
            </Button>
            <p className="min-w-0 flex-1 text-small text-ui-text-muted">
              {presetLabel ? (
                <>
                  Пресет <b className="font-semibold text-ui-text">«{presetLabel}»</b>
                  {aiPreset ? ' и AI-анализ' : ''} —{' '}
                  <button
                    type="button"
                    onClick={clearPreset}
                    className="font-semibold text-ui-accent hover:underline"
                  >
                    убрать
                  </button>
                </>
              ) : isReady ? (
                <>
                  <b className="font-semibold text-ui-text">{niche.trim()}</b>
                  {mode === 'radius'
                    ? ` · ${radiusKm.toFixed(1)} км от адреса`
                    : ` · ${city || 'Москва'}`}{' '}
                  · {sources.map((s) => SOURCE_NAMES[s]).join(' + ')} · ~1–2 мин
                </>
              ) : mode === 'radius' ? (
                'Введите нишу и адрес центра'
              ) : (
                '~1–2 мин до выдачи · сразу с отзывами и болями'
              )}
            </p>
          </div>
        </form>

        {/* === Как это работает === */}
        <div
          className="mt-16 grid gap-6 text-left sm:mt-20 sm:grid-cols-3 sm:gap-10"
          aria-label="Как это работает"
        >
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title}>
              <span className="text-xs font-bold tabular-nums tracking-widest text-ui-accent">
                0{i + 1}
              </span>
              <b className="mb-1 mt-2 block text-base font-bold text-ui-text">{step.title}</b>
              <p className="text-small leading-relaxed text-ui-text-muted">{step.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* === Быстрый старт и пресеты — серая полоса на всю ширину === */}
      <section
        aria-labelledby="quick-start-title"
        className="mt-16 bg-ui-surface-2 py-12 sm:mt-20 sm:py-14"
      >
        <div className="mx-auto w-full max-w-[1072px]">
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <h2
              id="quick-start-title"
              className="text-heading font-extrabold tracking-tight text-ui-text"
            >
              Быстрый старт.
            </h2>
            <span className="text-small text-ui-text-muted">
              не знаете, что ввести — запустите готовый пример
            </span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
            {QUICK_PRESETS.map((p) => (
              <button
                key={`${p.niche}-${p.city}`}
                type="button"
                onClick={() => runQuickPreset(p)}
                disabled={isLoading}
                className="flex flex-col items-start justify-start rounded-card bg-ui-surface p-4 text-left shadow-raised transition-all hover:-translate-y-0.5 hover:shadow-floating disabled:opacity-50 sm:p-5"
              >
                <span className="block text-xs font-bold uppercase tracking-widest text-ui-accent">
                  {p.city}
                </span>
                <b className="mb-0.5 mt-1 block text-base font-bold text-ui-text">{p.title}</b>
                <span className="text-small text-ui-text-muted">{p.hint}</span>
              </button>
            ))}
          </div>

          {/* На телефоне — одна строка с прокруткой, иначе чипы занимают пол-экрана. */}
          <div
            className="-mx-4 mt-6 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            role="group"
            aria-label="Пресеты фильтров"
          >
            {BUILTIN_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={presetLabel === p.label}
                onClick={() => (presetLabel === p.label ? clearPreset() : applyBuiltinPreset(p))}
                title={p.description}
                className={cn(PRESET_CHIP, presetLabel === p.label && PRESET_CHIP_ON)}
              >
                {p.label}
              </button>
            ))}
            {userPresets.map((p) => {
              const hasAi = !!(p.ai_prompt && p.ai_prompt.trim());
              return (
                <button
                  key={`u-${p.id}`}
                  type="button"
                  aria-pressed={presetLabel === p.name}
                  onClick={() => (presetLabel === p.name ? clearPreset() : applyUserPreset(p))}
                  title={p.description ?? (hasAi ? 'Мой пресет с AI-анализом' : 'Мой пресет')}
                  className={cn(PRESET_CHIP, presetLabel === p.name && PRESET_CHIP_ON)}
                >
                  {p.name}
                  {hasAi && (
                    <span className="rounded-full bg-ui-accent px-1.5 text-xs font-bold text-ui-accent-contrast">
                      AI
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSaveModalOpen(true)}
              className={cn(
                PRESET_CHIP,
                'border-dashed bg-transparent text-ui-text-muted shadow-none',
              )}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Сохранить текущие
            </button>
          </div>
          {presetLabel && (
            <p className="mt-3 text-small text-ui-text-muted">
              Пресет <b className="font-semibold text-ui-text">«{presetLabel}»</b> включится в
              выдаче сразу после поиска
              {aiPreset ? ', AI-анализ запустится автоматически' : ''}.
            </p>
          )}
          {builtinAiPrompt && (
            <p className="mt-2 text-small text-ui-text-muted">
              У этого пресета есть готовый AI-промпт —{' '}
              <button
                type="button"
                onClick={() => setCopyBuiltinModalOpen(true)}
                className="font-semibold text-ui-accent hover:underline"
              >
                сохраните как свой пресет
              </button>
              , чтобы запустить анализ.
            </p>
          )}
        </div>
      </section>

      {/* === Тонкая настройка === */}
      <div className="mx-auto w-full max-w-[1072px] pb-16 pt-14 sm:pb-24 sm:pt-16">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-control text-base font-bold text-ui-text [&::-webkit-details-marker]:hidden">
            Тонкая настройка.
            <span className="ml-auto flex items-center gap-1.5 text-small font-medium text-ui-text-muted">
              <span className={cn(extraCount === 0 && 'hidden sm:inline')}>
                {extraCount > 0
                  ? `задано: ${extraCount}`
                  : 'радиус, несколько ниш и городов, условия'}
              </span>
              <ChevronDown
                className="h-4 w-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </span>
          </summary>
          <div className="mt-5 flex flex-col gap-7 border-t border-black/[.08] pt-6">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <Segmented
                  aria-label="Режим поиска"
                  value={mode}
                  onChange={switchMode}
                  disabled={isLoading}
                  options={[
                    { value: 'city', label: 'По городу' },
                    {
                      value: 'radius',
                      label: 'В радиусе от адреса',
                      title: 'Компании в радиусе X км от адреса — «что у соседей по району»',
                    },
                  ]}
                />
                {mode === 'city' ? (
                  <div className="mt-4 flex flex-col gap-4">
                    <div>
                      <label htmlFor="search-extra-niches" className={LABEL}>
                        Ещё ниши — через запятую
                      </label>
                      <Input
                        id="search-extra-niches"
                        placeholder="ортодонт, детская стоматология"
                        value={extraNiches}
                        onChange={(e) => setExtraNiches(e.target.value)}
                        disabled={isLoading}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <label htmlFor="search-extra-cities" className={LABEL}>
                        Ещё города
                      </label>
                      <Input
                        id="search-extra-cities"
                        placeholder="Балашиха, Мытищи, Видное"
                        value={extraCities}
                        onChange={(e) => setExtraCities(e.target.value)}
                        disabled={isLoading}
                        className="h-11"
                      />
                      <p className="mt-1.5 text-xs text-ui-text-muted">
                        Создастся отдельный поиск на каждую пару «ниша × город» — все будут в
                        «Истории».
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-small text-ui-text-muted">
                    Адрес и радиус — в форме наверху. Поиск в радиусе пока работает только через
                    2GIS.
                  </p>
                )}
              </div>

              <div>
                <span className={LABEL}>Несколько условий по отзывам</span>
                <p className="text-xs text-ui-text-muted">
                  Когда одного списка слов мало — например, «содержит «запись» и не содержит
                  «рекомендую»».
                </p>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  aria-expanded={advancedOpen}
                  className="mt-3 inline-flex items-center gap-1 text-small font-semibold text-ui-accent hover:underline"
                >
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')}
                    aria-hidden
                  />
                  {advancedOpen ? 'Скрыть условия' : 'Задать условия'}
                </button>
                {advancedOpen && (
                  <div className="mt-3 rounded-card bg-ui-surface-2 p-4">
                    <FilterBuilder
                      value={filterSpec}
                      onChange={setFilterSpec}
                      disabled={isLoading}
                      fields={REVIEW_FILTER_FIELDS}
                      emptyHint="Добавьте условие — например, «В тексте отзыва есть» содержит «грубость»."
                      defaultTextPlaceholder="Например: не перезвонили, грубость, обман"
                    />
                  </div>
                )}
              </div>
            </div>

            <p className="flex items-start gap-3 rounded-card bg-ui-surface-2 px-4 py-3.5 text-small text-ui-text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ui-accent" aria-hidden />
              <span>
                <b className="font-semibold text-ui-text">
                  Фильтры по рейтингу, сайту, ЛПР и болям
                </b>{' '}
                — на странице результатов: применяются к найденным компаниям сразу, без нового
                поиска.
              </span>
            </p>
          </div>
        </details>
      </div>

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
