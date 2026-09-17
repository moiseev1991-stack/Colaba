'use client';

/**
 * Результаты поиска сайтов (режим «Сайты в Яндексе и Google»): что искали, прогресс в два этапа
 * и таблица с контактами.
 *
 * Как это работает на сервере (modules/searches, queue/tasks.py):
 *   1) выдача поисковика сохраняется в search_results (search.status pending → processing → completed);
 *   2) после этого по каждому домену идёт проверка сайта — контакты и текст страниц
 *      (search_result_pages, contact_status found / no_contacts / failed).
 * Условия (config.filters) сервер применяет к тексту проверенных страниц, поэтому до конца
 * этапа 2 подходящих сайтов может быть 0 — это не «ничего не найдено», а «ещё проверяем».
 * Прогресс этапа 2 считаем по /results/grouped — он отдаёт все результаты без фильтра.
 */

import { Download, ExternalLink, Loader2, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { KpModal } from '@/components/maps/KpModal';
import { Button, buttonClass } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createSiteLead, type SiteLead } from '@/src/services/api/outreach-site-leads';
import {
  getSearch,
  getSearchResults,
  getSearchResultsGrouped,
  type SearchResponse,
  type SearchResultResponse,
} from '@/src/services/api/search';

const POLL_MS = 3000;
/** Сколько ждём проверку сайтов, прежде чем перестать опрашивать (часть сайтов отвечает долго). */
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;

const PROVIDER_LABEL: Record<string, string> = {
  yandex_xml: 'Яндекс XML',
  yandex_html: 'Яндекс',
  google_html: 'Google',
};

const FIELD_LABEL: Record<string, string> = {
  text: 'текст страниц',
  title: 'текст страниц',
  meta: 'текст страниц',
  domain: 'домен',
};

const OP_LABEL: Record<string, string> = {
  contains: 'содержит',
  not_contains: 'не содержит',
  equals: '=',
  not_equals: '≠',
  starts_with: 'начинается с',
};

type Condition = { field: string; op: string; value?: string };

export function describeCondition(c: Condition): string {
  if (c.field === 'has_phone') return c.op === 'is_false' ? 'нет телефона' : 'есть телефон';
  if (c.field === 'has_email') return c.op === 'is_false' ? 'нет email' : 'есть email';
  return `${FIELD_LABEL[c.field] ?? c.field} ${OP_LABEL[c.op] ?? c.op} «${(c.value ?? '').trim()}»`;
}

export function SiteSearchResults({
  searchId,
  defaultTemplateKey,
}: {
  searchId: number;
  /** Шаблон КП, подсвеченный по умолчанию (от готового сценария). */
  defaultTemplateKey?: string;
}) {
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [rows, setRows] = useState<SearchResultResponse[]>([]);
  const [progress, setProgress] = useState<{ domains: number; checked: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kpLead, setKpLead] = useState<SiteLead | null>(null);
  const startedAt = useRef<number>(Date.now());
  const [timedOut, setTimedOut] = useState(false);

  const conditions: Condition[] = Array.isArray(search?.config?.filters?.conditions)
    ? search!.config!.filters.conditions
    : [];
  const logic: 'and' | 'or' = search?.config?.filters?.logic === 'or' ? 'or' : 'and';
  const firstWord =
    conditions.find((c) => c.op === 'contains' && c.value?.trim())?.value?.trim() ?? '';

  const collecting = !search || search.status === 'pending' || search.status === 'processing';
  const failed = search?.status === 'failed';
  const checkDone = !!progress && progress.domains > 0 && progress.checked >= progress.domains;
  const finished = failed || (!collecting && (checkDone || progress?.domains === 0 || timedOut));

  const tick = useCallback(async () => {
    try {
      const s = await getSearch(searchId);
      setSearch(s);
      setLoadError(null);
      if (s.status === 'completed') {
        const [grouped, filtered] = await Promise.all([
          getSearchResultsGrouped(searchId),
          getSearchResults(searchId),
        ]);
        const checked = grouped.domains.filter((d) =>
          d.results.some((r) => r.contact_status),
        ).length;
        setProgress({ domains: grouped.unique_domains, checked });
        setRows(filtered);
      }
    } catch (e: any) {
      setLoadError(
        e?.response?.status === 404
          ? 'Запуск не найден.'
          : 'Не удалось получить результаты — повторяем…',
      );
    }
  }, [searchId]);

  useEffect(() => {
    startedAt.current = Date.now();
    setSearch(null);
    setRows([]);
    setProgress(null);
    setTimedOut(false);
    void tick();
  }, [searchId, tick]);

  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => {
      if (Date.now() - startedAt.current > CHECK_TIMEOUT_MS) setTimedOut(true);
      void tick();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [finished, tick]);

  const onlyWithPhone = search?.config?.filter_phone === true;
  const shown = onlyWithPhone ? rows.filter((r) => r.phone && r.phone.trim()) : rows;
  const provider = PROVIDER_LABEL[search?.search_provider ?? ''] ?? search?.search_provider ?? '';
  const collectPct =
    search && search.num_results > 0
      ? Math.min(100, Math.round((search.result_count / search.num_results) * 100))
      : 0;
  const checkPct =
    progress && progress.domains > 0 ? Math.round((progress.checked / progress.domains) * 100) : 0;

  return (
    <section aria-label="Результаты поиска сайтов" className="flex flex-col gap-4">
      <div className="rounded-panel border border-black/[.06] bg-ui-surface p-5 shadow-raised sm:p-6">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ui-text-muted">
              Запуск №{searchId}
              {search && ` · ${provider} · top ${search.num_results}`}
            </p>
            <h2 className="mt-0.5 text-xl font-extrabold tracking-tight text-ui-text">
              «{search?.query ?? '…'}»
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ui-text-muted">Условия:</span>
              {conditions.length === 0 && !onlyWithPhone ? (
                <span className="text-xs font-semibold text-ui-text-muted">
                  без условий — все сайты выдачи
                </span>
              ) : (
                <>
                  {conditions.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5">
                      {i > 0 && (
                        <span className="text-xs font-semibold text-ui-text-muted">
                          {logic === 'and' ? 'и' : 'или'}
                        </span>
                      )}
                      <span className="rounded-full bg-ui-accent/[.08] px-2.5 py-0.5 text-xs font-semibold text-ui-accent">
                        {describeCondition(c)}
                      </span>
                    </span>
                  ))}
                  {onlyWithPhone && !conditions.some((c) => c.field === 'has_phone') && (
                    <span className="rounded-full bg-ui-accent/[.08] px-2.5 py-0.5 text-xs font-semibold text-ui-accent">
                      есть телефон
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          {!collecting && !failed && (
            <a
              href={`/api/v1/searches/${searchId}/results/export/csv`}
              className={buttonClass({ variant: 'secondary', className: 'shrink-0' })}
              title="CSV с сайтами под условия: домен, телефон, email"
            >
              <Download className="h-4 w-4" aria-hidden /> Выгрузить CSV
            </a>
          )}
        </div>

        {failed ? (
          <p
            role="alert"
            className="mt-5 rounded-card bg-ui-danger/[.07] px-4 py-3 text-small text-ui-danger"
          >
            Поиск не выполнен: {String(search?.config?.error ?? 'поисковая система вернула ошибку')}
            . Попробуйте другой поисковик или позже.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ProgressStep
              step={1}
              title={`Выдача ${provider || 'поисковика'}`}
              state={collecting ? 'active' : 'done'}
              percent={collecting ? collectPct : 100}
              caption={
                search
                  ? collecting
                    ? `${search.result_count} из ${search.num_results} результатов`
                    : `получено результатов: ${search.result_count}`
                  : 'ставим в очередь…'
              }
            />
            <ProgressStep
              step={2}
              title="Проверка сайтов: контакты и текст страниц"
              state={
                collecting ? 'waiting' : checkDone || progress?.domains === 0 ? 'done' : 'active'
              }
              percent={collecting ? 0 : progress?.domains === 0 ? 100 : checkPct}
              caption={
                collecting
                  ? 'начнётся после выдачи'
                  : progress
                    ? `${progress.checked} из ${progress.domains} сайтов${timedOut && !checkDone ? ' · часть сайтов отвечает долго' : ''}`
                    : 'считаем сайты…'
              }
            />
          </div>
        )}
        {loadError && <p className="mt-3 text-xs text-ui-warning">{loadError}</p>}
      </div>

      {!collecting && !failed && (
        <div className="overflow-hidden rounded-panel border border-black/[.06] bg-ui-surface shadow-raised">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ui-border px-5 py-3.5">
            <h3 className="text-base font-bold text-ui-text">
              {conditions.length > 0 || onlyWithPhone ? 'Подходят под условия' : 'Сайты'}:{' '}
              {shown.length}
            </h3>
            {!finished && (
              <span className="text-xs text-ui-text-muted">
                список пополняется по мере проверки сайтов
              </span>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-small text-ui-text-muted">
              {finished
                ? conditions.length > 0
                  ? `Ни один из ${progress?.checked ?? 0} проверенных сайтов не подошёл под условия. Попробуйте другое слово, условие «любое» или глубину top 100.`
                  : 'Поисковик ничего не вернул по этому запросу.'
                : 'Проверяем сайты — подходящие появятся здесь.'}
            </p>
          ) : (
            <table className="w-full text-small">
              <thead className="hidden bg-ui-surface-2 text-left text-xs font-semibold text-ui-text-muted md:table-header-group">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Сайт</th>
                  <th className="px-3 py-2.5 font-semibold">Телефон</th>
                  <th className="px-3 py-2.5 font-semibold">Email</th>
                  <th className="px-3 py-2.5 font-semibold">Нашлись слова</th>
                  <th className="px-5 py-2.5" aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <SiteRow
                    key={r.id}
                    row={r}
                    query={search?.query ?? ''}
                    entry={firstWord || search?.query || ''}
                    onKp={setKpLead}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <KpModal
        open={kpLead != null}
        siteLeadId={kpLead?.id ?? null}
        companyName={kpLead?.domain}
        defaultTemplateKey={defaultTemplateKey}
        onClose={() => setKpLead(null)}
      />
    </section>
  );
}

function ProgressStep({
  step,
  title,
  state,
  percent,
  caption,
}: {
  step: number;
  title: string;
  state: 'waiting' | 'active' | 'done';
  percent: number;
  caption: string;
}) {
  return (
    <div className={cn('rounded-card bg-ui-surface-2 p-4', state === 'waiting' && 'opacity-60')}>
      <div className="flex items-center gap-2 text-small font-semibold text-ui-text">
        <span
          className={cn(
            'grid h-5 w-5 place-items-center rounded-full text-xs font-bold',
            state === 'done'
              ? 'bg-ui-accent text-ui-accent-contrast'
              : 'bg-ui-surface text-ui-text-muted',
          )}
        >
          {state === 'active' ? (
            <Loader2 className="h-3 w-3 animate-spin text-ui-accent" aria-hidden />
          ) : (
            step
          )}
        </span>
        {title}
      </div>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-3 h-2 overflow-hidden rounded-full bg-ui-border"
      >
        <div
          className={cn(
            'h-full rounded-full bg-ui-accent transition-[width] duration-500',
            state === 'active' && percent === 0 && 'w-1/4 animate-pulse',
          )}
          style={
            state === 'active' && percent === 0
              ? undefined
              : { width: `${Math.max(state === 'done' ? 100 : 2, percent)}%` }
          }
        />
      </div>
      <p className="mt-2 text-xs tabular-nums text-ui-text-muted">
        {state === 'active' && percent > 0 ? `${percent}% · ` : ''}
        {caption}
      </p>
    </div>
  );
}

function SiteRow({
  row,
  query,
  entry,
  onKp,
}: {
  row: SearchResultResponse;
  query: string;
  entry: string;
  onKp: (lead: SiteLead) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const domain = row.domain || row.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const checking = !row.contact_status;

  async function handleKp() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onKp(
        await createSiteLead({
          query,
          entry,
          url: row.url,
          title: row.title,
          snippet: row.snippet ?? null,
          search_id: row.search_id,
        }),
      );
    } catch (e: any) {
      setError(e?.message || 'Не удалось подготовить КП');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="grid grid-cols-1 gap-1 border-t border-ui-border px-5 py-3 first:border-t-0 md:table-row md:px-0 md:py-0">
      <td className="min-w-0 md:max-w-[320px] md:px-5 md:py-3">
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-full items-center gap-1 font-semibold text-ui-text hover:text-ui-accent"
        >
          <span className="truncate">{row.title || domain}</span>
          <ExternalLink
            className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100"
            aria-hidden
          />
        </a>
        <span className="block truncate text-xs text-ui-text-muted">{domain}</span>
        {error && <span className="block text-xs text-ui-danger">{error}</span>}
      </td>
      <td className="whitespace-nowrap tabular-nums md:px-3 md:py-3">
        {row.phone ? (
          <a href={`tel:${row.phone}`} className="text-ui-text hover:text-ui-accent">
            {row.phone}
          </a>
        ) : (
          <span className="text-xs text-ui-text-muted">{checking ? 'проверяем…' : '—'}</span>
        )}
      </td>
      <td className="min-w-0 md:max-w-[220px] md:px-3 md:py-3">
        {row.email ? (
          <a
            href={`mailto:${row.email}`}
            className="block truncate text-ui-text hover:text-ui-accent"
          >
            {row.email}
          </a>
        ) : (
          <span className="text-xs text-ui-text-muted">{checking ? 'проверяем…' : '—'}</span>
        )}
      </td>
      <td className="md:px-3 md:py-3">
        <div className="flex flex-wrap gap-1">
          {(row.keyword_hits ?? []).slice(0, 4).map((w) => (
            <span
              key={w}
              className="rounded-full bg-ui-accent/[.08] px-2 py-0.5 text-xs font-semibold text-ui-accent"
            >
              {w}
            </span>
          ))}
        </div>
      </td>
      <td className="md:px-5 md:py-3 md:text-right">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void handleKp()}
          loading={busy}
          iconLeft={<Send />}
        >
          КП
        </Button>
      </td>
    </tr>
  );
}
