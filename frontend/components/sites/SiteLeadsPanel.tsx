'use client';

/**
 * «Сайты в Яндексе и Google» (/app/leads?tab=sites) — отдельный вид поиска на странице «Поиск»:
 * сайты из выдачи поисковиков по запросу и городу с условиями по тексту страниц
 * (например, стоматологии Москвы, у которых на сайте есть «протезирование») → контакты и таблица.
 *
 * 16.09 вернули настройки старой формы «По сайтам» (LegacyLeadsPanel, до Эпика F 12.06):
 * город, источник (Яндекс XML / Яндекс / Google), глубина Top 10–100, «Только сайты с телефоном»,
 * условия по сайту (FilterBuilder), популярные ниши и «Последние запуски». Поиск по вхождению
 * («© 2021», «Joomla») и кнопка «КП» на карточке — как в Эпике F.
 *
 * Поток: POST /searches (query = запрос + город, config.filters) → опрос GET /searches/{id} до
 * completed → GET /searches/{id}/results (условия применяет сервер) → карточки SiteResultCard.
 * «Только с телефоном» сервер больше не применяет — фильтруем карточки здесь.
 */

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Table2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CityCombobox } from '@/components/CityCombobox';
import { DEFAULT_SITE_FIELDS, FilterBuilder, type FilterSpec } from '@/components/FilterBuilder';
import { SearchModeSwitch } from '@/components/search/SearchModeSwitch';
import { KpModal } from '@/components/maps/KpModal';
import { SITE_ENTRY_PRESETS, type SiteEntryPreset } from '@/components/sites/siteEntryPresets';
import { SiteResultCard } from '@/components/sites/SiteResultCard';
import { Button, buttonClass } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { listSearches, type SearchResponse } from '@/src/services/api/search';
import type { SiteLead } from '@/src/services/api/outreach-site-leads';
import {
  createWebSearch,
  getWebSearch,
  getWebSearchResults,
  type WebSearchOut,
  type WebSearchProvider,
  type WebSearchResult,
} from '@/src/services/api/web-searches';

type Status = 'idle' | 'searching' | 'ready' | 'error';

const NICHE_PRESETS: Array<{ label: string; cat: string }> = [
  { label: 'строительные компании', cat: 'B2B' },
  { label: 'юридические услуги', cat: 'услуги' },
  { label: 'стоматология', cat: 'медицина' },
  { label: 'автосервис', cat: 'авто' },
  { label: 'доставка еды', cat: 'food' },
  { label: 'клининговая компания', cat: 'услуги' },
  { label: 'ремонт квартир', cat: 'строй' },
  { label: 'бухгалтерские услуги', cat: 'B2B' },
  { label: 'рекламное агентство', cat: 'B2B' },
  { label: 'фитнес клуб', cat: 'health' },
];

const PROVIDERS: { value: WebSearchProvider; label: string }[] = [
  { value: 'yandex_xml', label: 'Яндекс XML' },
  { value: 'yandex_html', label: 'Яндекс' },
  { value: 'google_html', label: 'Google' },
];

const DEPTHS = [10, 20, 50, 100];

const OP_TEXT: Record<string, string> = {
  contains: 'содержит',
  not_contains: 'не содержит',
  equals: '=',
  not_equals: '≠',
  starts_with: 'начинается с',
};

const LABEL = 'mb-1.5 block text-xs font-semibold text-ui-text-muted';
const CHIP =
  'inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ui-border bg-ui-surface px-3.5 py-1 text-xs font-semibold text-ui-text-muted transition-colors hover:border-ui-text-muted/50 hover:text-ui-text disabled:cursor-not-allowed disabled:opacity-50';
const CHIP_ON =
  'border-ui-text bg-ui-text text-ui-surface hover:border-ui-text hover:text-ui-surface';

export function SiteLeadsPanel() {
  const [entry, setEntry] = useState('');
  const [city, setCity] = useState('');
  const [provider, setProvider] = useState<WebSearchProvider>('yandex_xml');
  const [depth, setDepth] = useState(50);
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  // Одно пустое условие сразу на виду — главный сценарий «на сайте есть слово».
  const [filterSpec, setFilterSpec] = useState<FilterSpec>({
    logic: 'and',
    conditions: [{ field: 'text', op: 'contains', value: '' }],
  });
  const [showAllNiches, setShowAllNiches] = useState(false);
  const [activePresetIdx, setActivePresetIdx] = useState<number | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState<WebSearchOut | null>(null);
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recentRuns, setRecentRuns] = useState<SearchResponse[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  // Какой SiteLead открыт в KpModal и какой шаблон КП подсветить (от пресета).
  const [kpSiteLead, setKpSiteLead] = useState<SiteLead | null>(null);
  const [kpDefaultTemplateKey, setKpDefaultTemplateKey] = useState<string | undefined>(undefined);

  const loadRecent = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await listSearches({ limit: 6, offset: 0 });
      setRecentRuns(data.slice(0, 6));
    } catch {
      setRecentRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  const query = [entry.trim(), city.trim()].filter(Boolean).join(' ');

  async function handlePreset(preset: SiteEntryPreset, idx: number) {
    setEntry(preset.query);
    setActivePresetIdx(idx);
    setKpDefaultTemplateKey(preset.kpTemplateKey);
    await runSearch([preset.query, city.trim()].filter(Boolean).join(' '));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!entry.trim()) return;
    setActivePresetIdx(SITE_ENTRY_PRESETS.findIndex((p) => p.query === entry.trim()));
    await runSearch(query);
  }

  async function runSearch(q: string) {
    stopPolling();
    setStatus('searching');
    setErrorMsg(null);
    setSearch(null);
    setResults([]);

    // Пустые условия не отправляем — сервер их всё равно пропустит.
    const conditions = filterSpec.conditions.filter(
      (c) => c.op === 'is_true' || c.op === 'is_false' || (c.value && c.value.trim()),
    );
    // «Только с телефоном» при условиях «все сразу» отдаём серверу — тогда и таблица /runs/{id} без сайтов без телефона.
    if (
      onlyWithPhone &&
      filterSpec.logic === 'and' &&
      !conditions.some((c) => c.field === 'has_phone')
    ) {
      conditions.push({ field: 'has_phone', op: 'is_true', value: '' });
    }
    try {
      const s = await createWebSearch({
        query: q,
        search_provider: provider,
        num_results: depth,
        config: {
          module: 'leads',
          filter_phone: onlyWithPhone,
          ...(conditions.length > 0 ? { filters: { logic: filterSpec.logic, conditions } } : {}),
        },
      });
      setSearch(s);
      void loadRecent();
      // Опрос раз в 2 секунды до завершения: modules/searches не отдаёт SSE.
      pollTimer.current = setInterval(async () => {
        try {
          const latest = await getWebSearch(s.id);
          setSearch(latest);
          if (latest.status === 'completed') {
            stopPolling();
            setResults(await getWebSearchResults(s.id));
            setStatus('ready');
            void loadRecent();
          } else if (latest.status === 'failed') {
            stopPolling();
            setStatus('error');
            setErrorMsg('Поисковая система вернула ошибку. Попробуйте другой запрос или источник.');
            void loadRecent();
          }
        } catch {
          /* продолжаем опрос */
        }
      }, 2000);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message;
      setErrorMsg(
        typeof detail === 'string'
          ? detail
          : 'Не удалось запустить поиск. Проверьте подключение и попробуйте снова.',
      );
      setStatus('error');
    }
  }

  const shownResults = onlyWithPhone ? results.filter((r) => r.phone && r.phone.trim()) : results;
  const niches = showAllNiches ? NICHE_PRESETS : NICHE_PRESETS.slice(0, 6);
  const searching = status === 'searching';
  const filledConditions = filterSpec.conditions.filter(
    (c) => c.op === 'is_true' || c.op === 'is_false' || c.value.trim(),
  );
  const conditionsText = filledConditions
    .map((c) => {
      const field =
        DEFAULT_SITE_FIELDS.find((f) => f.id === c.field)?.label.toLowerCase() ?? c.field;
      if (c.op === 'is_true') return field;
      if (c.op === 'is_false') return `нет: ${field}`;
      return `${field} ${OP_TEXT[c.op] ?? c.op} «${c.value.trim()}»`;
    })
    .join(filterSpec.logic === 'and' ? ' и ' : ' или ');

  return (
    <div>
      <div className="text-center">
        <h1 className="mx-auto max-w-[800px] text-hero font-extrabold text-ui-text">
          Сайты с нужными словами.
          <span className="block font-bold text-ui-text-muted/75">Из выдачи Яндекса и Google.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[60ch] text-base leading-relaxed text-ui-text-muted">
          Задайте запрос и город и добавьте условие по сайту — например, стоматологии Москвы, у
          которых на страницах есть <b className="font-semibold text-ui-text">«протезирование»</b>.
          Получите сайты с телефонами, email и таблицу для выгрузки.
        </p>
      </div>

      <SearchModeSwitch active="sites" className="mt-10" />

      <form
        onSubmit={handleSubmit}
        aria-label="Параметры поиска по сайтам"
        className="mx-auto mt-4 max-w-[860px] rounded-panel border border-black/[.06] bg-ui-surface p-5 shadow-floating sm:p-7"
      >
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_0.8fr]">
          <div className="min-w-0">
            <label htmlFor="sites-query" className={LABEL}>
              Запрос в поисковик
            </label>
            <Input
              id="sites-query"
              value={entry}
              onChange={(e) => {
                setEntry(e.target.value);
                setActivePresetIdx(null);
                setKpDefaultTemplateKey(undefined);
              }}
              placeholder="Например: стоматология"
              disabled={searching}
              className="h-12 text-base font-medium"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="sites-city" className={LABEL}>
              Город
            </label>
            <div className="flex items-center gap-1.5">
              <CityCombobox
                id="sites-city"
                city={city}
                onCityChange={(c) => setCity(c)}
                disabled={searching}
                placeholder="Любой"
                triggerClassName="h-12"
                className="min-w-0 flex-1"
              />
              {city && (
                <button
                  type="button"
                  onClick={() => setCity('')}
                  aria-label="Убрать город"
                  className="grid h-12 w-9 shrink-0 place-items-center rounded-control text-ui-text-muted hover:bg-ui-surface-2 hover:text-ui-text"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <label htmlFor="sites-provider" className={LABEL}>
              Поисковик
            </label>
            <Select
              id="sites-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as WebSearchProvider)}
              disabled={searching}
              wrapperClassName="block"
              className="h-12 w-full"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-ui-text-muted">Популярные</span>
          {niches.map((n) => (
            <button
              key={n.label}
              type="button"
              onClick={() => {
                setEntry(n.label);
                setActivePresetIdx(null);
                setKpDefaultTemplateKey(undefined);
              }}
              disabled={searching}
              className={cn(CHIP, entry === n.label && CHIP_ON)}
            >
              {n.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowAllNiches((v) => !v)}
            className={cn(CHIP, 'text-ui-accent')}
          >
            {showAllNiches ? 'свернуть' : `+${NICHE_PRESETS.length - 6}`}
          </button>
        </div>

        <div className="mt-5 rounded-card bg-ui-surface-2 p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="text-base font-bold text-ui-text">Условия по сайту</h2>
            <p className="text-xs text-ui-text-muted">
              Оставим только сайты, где выполняются условия: текст страниц содержит
              «протезирование», не содержит «вакансии», домен, телефон или email.
            </p>
          </div>
          <FilterBuilder
            value={filterSpec}
            onChange={setFilterSpec}
            disabled={searching}
            emptyHint="Без условий покажем все сайты из выдачи."
            defaultTextPlaceholder="Например: протезирование"
          />
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-black/[.06] pt-4">
            <div className="w-40">
              <label htmlFor="sites-depth" className={LABEL}>
                Глубина выдачи
              </label>
              <Select
                id="sites-depth"
                value={String(depth)}
                onChange={(e) => setDepth(Number(e.target.value))}
                disabled={searching}
                wrapperClassName="block"
                className="h-10 w-full bg-ui-surface"
              >
                {DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    Top {d}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-2.5 text-small text-ui-text">
              <input
                type="checkbox"
                checked={onlyWithPhone}
                onChange={(e) => setOnlyWithPhone(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-[hsl(var(--color-accent))]"
              />
              Только сайты с телефоном
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-ui-text-muted">
            Готовые сценарии для веб-студий
          </span>
          {SITE_ENTRY_PRESETS.map((p, idx) => (
            <button
              key={p.query}
              type="button"
              onClick={() => void handlePreset(p, idx)}
              title={p.hint}
              disabled={searching}
              className={cn(CHIP, activePresetIdx === idx && CHIP_ON)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-black/[.06] pt-5">
          <Button
            type="submit"
            disabled={!entry.trim()}
            loading={searching}
            iconRight={!searching ? <ArrowRight /> : undefined}
            className="h-12 w-full px-7 text-base sm:w-auto"
          >
            {searching ? 'Поиск…' : 'Найти сайты'}
          </Button>
          <p className="min-w-0 flex-1 text-small text-ui-text-muted">
            {entry.trim() ? (
              <>
                Найдём <b className="font-semibold text-ui-text">top {depth}</b> в{' '}
                {PROVIDERS.find((p) => p.value === provider)?.label} по{' '}
                <b className="font-semibold text-ui-text">«{query}»</b>
                {conditionsText && <> — где {conditionsText}</>}
                {onlyWithPhone && ', только с телефоном'}
              </>
            ) : (
              'Введите запрос — например, нишу бизнеса'
            )}
          </p>
        </div>
      </form>

      {(status !== 'idle' || results.length > 0) && (
        <section
          aria-label="Найденные сайты"
          className="mx-auto mt-10 flex max-w-[860px] flex-col gap-3"
        >
          {searching && (
            <p className="rounded-card bg-ui-surface-2 px-4 py-3 text-small text-ui-text-muted">
              Поиск сайтов по запросу «{query}»…
              {search && ` Найдено: ${search.result_count}.`}
            </p>
          )}
          {status === 'error' && errorMsg && (
            <p
              role="alert"
              className="rounded-card bg-ui-danger/[.07] px-4 py-3 text-small text-ui-danger"
            >
              {errorMsg}
            </p>
          )}
          {status === 'ready' && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-extrabold tracking-tight text-ui-text">
                  Найдено {shownResults.length}{' '}
                  {plural(shownResults.length, 'сайт', 'сайта', 'сайтов')}.
                </h2>
                {onlyWithPhone && results.length !== shownResults.length && (
                  <span className="text-small text-ui-text-muted">
                    с телефоном — из {results.length}
                  </span>
                )}
                {search && (
                  <Link
                    href={`/runs/${search.id}`}
                    className={buttonClass({ className: 'ml-auto' })}
                  >
                    <Table2 className="h-4 w-4" aria-hidden /> Таблица с контактами и выгрузкой
                  </Link>
                )}
              </div>
              {shownResults.length === 0 ? (
                <p className="rounded-card bg-ui-surface-2 px-4 py-6 text-center text-small text-ui-text-muted">
                  По этому запросу ничего не нашлось. Попробуйте другой запрос, источник или уберите
                  условия.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {shownResults.map((r) => (
                    <SiteResultCard
                      key={r.id}
                      result={r}
                      entry={entry}
                      query={query}
                      onKpForLead={(lead) => setKpSiteLead(lead)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby="sites-recent" className="mx-auto mt-14 max-w-[860px]">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 id="sites-recent" className="text-xl font-extrabold tracking-tight text-ui-text">
            Последние запуски.
          </h2>
          {recentRuns.length > 0 && (
            <Link
              href="/app/leads/history?tab=sites"
              className="ml-auto inline-flex items-center gap-1 text-small font-semibold text-ui-text-muted hover:text-ui-accent"
            >
              Вся история <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
        {runsLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-card bg-ui-surface-2" />
            ))}
          </div>
        ) : recentRuns.length === 0 ? (
          <p className="rounded-card bg-ui-surface-2 px-4 py-6 text-center text-small text-ui-text-muted">
            Запусков пока нет — введите нишу выше и нажмите «Найти сайты».
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentRuns.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/runs/${r.id}`}
                  className="flex items-center gap-4 rounded-card border border-black/[.05] bg-ui-surface px-4 py-3 shadow-raised transition-all hover:-translate-y-px hover:shadow-floating"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-semibold text-ui-text"
                      title={r.query}
                    >
                      {r.query}
                    </span>
                    <span className="block text-xs text-ui-text-muted">
                      {formatRelative(r.created_at)} · {r.result_count ?? 0}{' '}
                      {plural(r.result_count ?? 0, 'сайт', 'сайта', 'сайтов')}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      r.status === 'completed'
                        ? 'bg-ui-success/10 text-ui-success'
                        : r.status === 'failed'
                          ? 'bg-ui-danger/10 text-ui-danger'
                          : 'bg-ui-warning/10 text-ui-warning',
                    )}
                  >
                    {statusLabel(r.status)}
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-ui-text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <KpModal
        open={kpSiteLead != null}
        siteLeadId={kpSiteLead?.id ?? null}
        companyName={kpSiteLead?.domain}
        defaultTemplateKey={kpDefaultTemplateKey}
        onClose={() => setKpSiteLead(null)}
      />
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatRelative(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} дн назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function statusLabel(s: string): string {
  if (s === 'completed') return 'готово';
  if (s === 'failed') return 'ошибка';
  if (s === 'processing' || s === 'running') return 'в работе';
  return 'в очереди';
}
