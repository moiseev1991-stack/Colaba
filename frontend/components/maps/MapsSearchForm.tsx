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

import { useState } from 'react';
import { Loader2, Sparkles, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';

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

const NICHE_PRESETS: Array<{ label: string; cat: string }> = [
  { label: 'стоматология', cat: 'медицина' },
  { label: 'автосервис', cat: 'авто' },
  { label: 'ремонт квартир', cat: 'строй' },
  { label: 'юридические услуги', cat: 'услуги' },
  { label: 'бухгалтерские услуги', cat: 'B2B' },
  { label: 'клининговая компания', cat: 'услуги' },
  { label: 'фитнес клуб', cat: 'health' },
  { label: 'доставка еды', cat: 'food' },
  { label: 'рекламное агентство', cat: 'B2B' },
  { label: 'строительные компании', cat: 'B2B' },
];

// «Быстрый старт»: ниша + город сразу, один клик — поиск запущен.
// Для onboarding'а: новый пользователь не должен думать, что вбить.
const QUICK_PRESETS: Array<{ niche: string; city: string; title: string; hint: string }> = [
  {
    niche: 'стоматология',
    city: 'Москва',
    title: 'Стоматологии Москвы',
    hint: '~50 компаний с отзывами клиентов',
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
  onStarted: (search: MapSearchOut) => void;
}

export function MapsSearchForm({ onStarted }: Props) {
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('Москва');
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

  // Превращаем FilterSpec в MapSearchFilter (только текстовые условия для отзывов).
  // Если у пользователя несколько contains / not_contains — берём первое каждого,
  // потому что бэкенд принимает по одной подстроке. (Сложный AND/OR-граф потом,
  // если правда понадобится — сейчас не нужно.)
  function buildFilters(): MapSearchFilter | null {
    const contains = filterSpec.conditions.find(
      (c) => c.field === 'review_text' && c.op === 'contains' && c.value.trim()
    );
    const notContains = filterSpec.conditions.find(
      (c) => c.field === 'review_text' && c.op === 'not_contains' && c.value.trim()
    );
    if (!contains && !notContains) return null;
    return {
      review_text_contains: contains?.value.trim() ?? null,
      review_text_excludes: notContains?.value.trim() ?? null,
    };
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
    setIsLoading(true);
    try {
      const filters = buildFilters();
      const search = await createMapSearch({
        niche: niche.trim(),
        city: city.trim() || 'Москва',
        sources,
        ...(filters ? { filters } : {}),
      });
      onStarted(search);
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
      onStarted(search);
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
    <div className="mx-auto max-w-[1200px] px-6 py-10 relative z-10">
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

      {/* === HERO === */}
      <section className="mb-8 app-reveal">
        <div className="flex items-center gap-3 mb-5">
          <span className="app-live-dot" aria-hidden />
          <span className="app-mono-label" style={{ color: 'hsl(var(--accent))' }}>
            01 / Поиск по картам
          </span>
          <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
            2GIS · Яндекс.Карты
          </span>
        </div>
        <h1 className="text-[40px] md:text-[56px] font-extrabold leading-[0.98] tracking-[-2px] mb-5">
          Компании с <span className="app-hero-gradient">«болями» клиентов</span>
          <br className="hidden md:block" />
          <span className="md:inline"> </span>из отзывов на картах.
        </h1>
        <p className="text-[16px] md:text-[17px] max-w-[640px]" style={{ color: 'hsl(var(--muted))' }}>
          Введите нишу и город — модуль найдёт компании в 2GIS / Яндекс.Картах,
          подтянет отзывы и выделит «боли» клиентов, чтобы было о чём писать в холодную рассылку.
        </p>
      </section>

      {/* === LAUNCH PANEL === */}
      <section className="app-hero-card app-reveal app-reveal-delay-1">
        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          <div
            className="flex items-center justify-between mb-6 pb-5 border-b"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-3">
              <span className="app-step-num app-step-num-active">02</span>
              <div>
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
            <div className="flex flex-wrap gap-2">
              {displayedPresets.map((p) => {
                const active = niche === p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handlePreset(p.label)}
                    className={cn('app-chip group', active && 'app-chip-active')}
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
                      checked ? 'border-emerald-500 bg-emerald-500/10' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--accent)/0.6)]'
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
                  Спарсим <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{niche.trim()}</span> в{' '}
                  <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{city || 'Москве'}</span> через{' '}
                  {sources.map((s) => (s === '2gis' ? '2GIS' : 'Яндекс.Карты')).join(' + ')}
                </>
              ) : (
                <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                  введите нишу — минимум 2 символа
                </span>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
