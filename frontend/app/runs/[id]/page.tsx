'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { LeadsTable } from '@/components/LeadsTable';
import { LeadsResultsTable } from '@/components/LeadsResultsTable';
import { getSearch, getSearchResults } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import type { LeadRow } from '@/lib/types';
import { mapExtraDataToSeo, mapExtraDataToIssues } from '@/lib/searchResultMapping';
import { Download, ChevronRight, Users, TrendingUp, Landmark } from 'lucide-react';
import { useModule } from '@/lib/ModuleContext';

const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const AUDIT_POLLING_GRACE_MS = 3 * 60 * 1000;

function getAdaptiveInterval(elapsedMs: number): number {
  if (elapsedMs > 90_000) return 8_000;
  if (elapsedMs > 30_000) return 4_000;
  return 2_000;
}

type ModuleId = 'leads' | 'tenders' | 'seo';

function moduleFromConfig(config: SearchResponse['config'] | null | undefined): ModuleId | null {
  if (config && typeof config === 'object') {
    const m = (config as Record<string, unknown>).module;
    if (m === 'leads' || m === 'tenders' || m === 'seo') return m;
  }
  return null;
}

const MODULE_META: Record<ModuleId, { label: string; icon: typeof Users; historyHref: string; mono: string }> = {
  leads: { label: 'Поиск лидов', icon: Users, historyHref: '/app/leads/history', mono: '01 / leads' },
  tenders: { label: 'Госзакупки', icon: Landmark, historyHref: '/app/gos/history', mono: '02 / tenders' },
  seo: { label: 'SEO', icon: TrendingUp, historyHref: '/runs', mono: '03 / seo' },
};

export default function RunResultsPage() {
  const params = useParams();
  const runId = params.id as string;
  const { module: activeModule, setModuleSilent } = useModule();

  const [results, setResults] = useState<LeadRow[]>([]);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollTimeout, setPollTimeout] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const activeRef = useRef(true);
  const processingStartRef = useRef<number | null>(null);
  const auditUntilRef = useRef<number>(0);
  const lastCountRef = useRef<number>(-1);
  const lastStatusRef = useRef<string>('');
  const lastProcessedCountRef = useRef<number>(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeRef.current = true;
    processingStartRef.current = null;
    lastCountRef.current = -1;
    lastStatusRef.current = '';
    lastProcessedCountRef.current = -1;
    setPollTimeout(false);
    setLoading(true);
    setSearch(null);
    setResults([]);
  }, [runId]);

  useEffect(() => {
    activeRef.current = true;

    const schedule = (delayMs: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (!activeRef.current) return;

      try {
        const searchId = parseInt(runId);
        if (isNaN(searchId)) {
          setError('Неверный ID запуска');
          setLoading(false);
          return;
        }

        const searchData = await getSearch(searchId);
        if (!activeRef.current) return;
        setSearch(searchData);

        const countChanged = searchData.result_count !== lastCountRef.current;
        const statusChanged = searchData.status !== lastStatusRef.current;
        const auditActive = Date.now() < auditUntilRef.current;
        const needsResults = countChanged || statusChanged || auditActive || lastCountRef.current === -1;

        if (needsResults || searchData.status === 'completed') {
          // Filter (config.filters) is read server-side from the search itself,
          // so a plain GET applies it automatically — no per-request override.
          const resultsData = await getSearchResults(searchId);
          if (!activeRef.current) return;

          const rows: LeadRow[] = resultsData.map((r) => {
            const status: 'ok' | 'error' | 'processing' =
              r.contact_status === 'found' || r.contact_status === 'no_contacts' ? 'ok'
                : r.contact_status === 'failed' ? 'error'
                  : 'processing';

            // Pull "about the company" straight from the crawled home page —
            // its meta description / title are usually a clean self-description,
            // unlike search engine snippets which are torn out of context.
            const extra = (r.extra_data && typeof r.extra_data === 'object'
              ? (r.extra_data as Record<string, unknown>)
              : {}) as Record<string, unknown>;
            const crawl = extra.crawl as
              | { pages?: Array<{ title?: string | null; meta_description?: string | null }> }
              | undefined;
            const firstPage = crawl?.pages?.[0];
            const siteMetaDescription = firstPage?.meta_description?.trim() || null;
            const sitePageTitle = firstPage?.title?.trim() || null;

            // Backend classifier output — site type + already-cleaned description.
            const classification = extra.classification as
              | { site_type?: string | null; clean_description?: string | null }
              | undefined;
            const allowedTypes = ['company', 'catalog', 'market', 'social', 'news', 'gov', 'broken', 'unknown'] as const;
            const rawType = classification?.site_type;
            const siteType = (allowedTypes as readonly string[]).includes(rawType ?? '')
              ? (rawType as LeadRow['siteType'])
              : null;
            const cleanDescription = classification?.clean_description?.trim() || null;

            return {
              id: String(r.id),
              domain: r.domain || '',
              phone: r.phone ?? null,
              email: r.email ?? null,
              score: r.seo_score ?? 0,
              issues: mapExtraDataToIssues(r.extra_data),
              seo: mapExtraDataToSeo(r.extra_data),
              status,
              outreachText: r.outreach_text || '',
              outreachSubject: r.outreach_subject ?? null,
              titleFromSearch: r.title ?? null,
              snippetFromSearch: r.snippet ?? null,
              urlFromSearch: r.url ?? null,
              siteMetaDescription,
              sitePageTitle,
              cleanDescription,
              siteType,
              keywordHits: r.keyword_hits ?? null,
            };
          });
          setResults(rows);
          setLastUpdated(new Date());
          lastCountRef.current = searchData.result_count;
          lastStatusRef.current = searchData.status;

          const processedCount = rows.filter((r) => r.status !== 'processing').length;
          const hasUnprocessed = processedCount < rows.length;

          if ((searchData.status === 'completed' || searchData.status === 'failed') && !auditActive && !hasUnprocessed) {
            return;
          }

          if (searchData.status === 'completed' && !auditActive) {
            if (processedCount === lastProcessedCountRef.current && !hasUnprocessed) {
              return;
            }
            lastProcessedCountRef.current = processedCount;
          }
        }

        if (searchData.status === 'pending' || searchData.status === 'processing') {
          if (processingStartRef.current === null) processingStartRef.current = Date.now();
          const elapsed = Date.now() - (processingStartRef.current ?? 0);
          if (elapsed > POLL_TIMEOUT_MS) {
            setPollTimeout(true);
            return;
          }
          schedule(getAdaptiveInterval(elapsed));
        } else {
          schedule(8_000);
        }
      } catch {
        if (activeRef.current) schedule(5_000);
      } finally {
        if (activeRef.current) setLoading(false);
      }
    };

    tick();

    return () => {
      activeRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [runId, refreshTrigger]);

  // Module from the run itself — needed both for the side-effect below and
  // for the table fork further down. Computed early so all hooks run on every
  // render in the same order, regardless of loading/error early returns.
  const configModule = moduleFromConfig(search?.config);

  // Keep sidebar in sync with the run we just opened. Only when config has an
  // explicit module — we don't want a legacy run to flip the user's choice.
  useEffect(() => {
    if (configModule && configModule !== activeModule) {
      setModuleSilent(configModule);
    }
  }, [configModule, activeModule, setModuleSilent]);

  if (loading && !search) {
    return (
      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 py-10">
        <div className="text-center" style={{ color: 'hsl(var(--muted))' }}>Загрузка…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1250px] mx-auto px-6 py-8">
        <div className="p-4" style={{ background: 'hsl(var(--danger) / 0.08)', border: '1px solid hsl(var(--danger) / 0.3)', borderRadius: 6 }}>
          <p style={{ color: 'hsl(var(--danger))' }}>{error}</p>
        </div>
      </div>
    );
  }

  // Module priority for the result view:
  //   1) The module saved on the run itself (config.module) — runs created
  //      from "Поиск лидов" carry config.module='leads'. Authoritative.
  //   2) Sidebar context as fallback — for legacy runs with no module saved.
  //   3) seo — final fallback (legacy SEO audits before module tagging existed).
  const moduleId: ModuleId = configModule ?? activeModule ?? 'seo';
  const moduleMeta = MODULE_META[moduleId];
  const ModuleIcon = moduleMeta.icon;

  const searchQuery = search?.query || 'Запрос';
  const searchProvider = search?.search_provider || '—';
  const searchStatus = search?.status || 'unknown';
  const configError = search?.config && typeof search.config === 'object'
    ? (search.config as Record<string, unknown>).error
    : null;
  const configErrorType = search?.config && typeof search.config === 'object'
    ? (search.config as Record<string, unknown>).error_type
    : null;
  const isProcessing = searchStatus === 'processing' || searchStatus === 'pending';
  const expectedResults = search?.num_results || 100;
  const progressPercent = isProcessing && expectedResults > 0
    ? Math.min(100, Math.round((results.length / expectedResults) * 100))
    : searchStatus === 'completed' ? 100 : 0;

  const processedCount = results.filter((r) => r.status !== 'processing').length;
  const isBackgroundProcessing = searchStatus === 'completed' && processedCount < results.length;
  const backgroundProgressPercent = results.length > 0
    ? Math.round((processedCount / results.length) * 100)
    : 0;

  const statusLabel =
    searchStatus === 'completed' ? 'готово'
      : searchStatus === 'failed' ? 'ошибка'
        : isProcessing ? 'поиск'
          : isBackgroundProcessing ? 'обработка'
            : searchStatus;
  const statusColor =
    searchStatus === 'completed' ? 'hsl(var(--success))'
      : searchStatus === 'failed' ? 'hsl(var(--danger))'
        : 'hsl(var(--warning))';

  return (
    <div className="w-full max-w-[1250px] min-w-0 mx-auto px-4 md:px-6 py-6 overflow-x-hidden">
      {/* Breadcrumb + module label */}
      <nav className="flex items-center gap-1.5 mb-4 app-mono-label flex-wrap" style={{ color: 'hsl(var(--muted))' }}>
        <Link href="/" className="hover:text-[hsl(var(--accent))] transition-colors">главная</Link>
        <ChevronRight className="h-3 w-3 opacity-60" />
        <Link href={moduleMeta.historyHref} className="hover:text-[hsl(var(--accent))] transition-colors">{moduleMeta.label.toLowerCase()}</Link>
        <ChevronRight className="h-3 w-3 opacity-60" />
        <span style={{ color: 'hsl(var(--text))' }}>результаты</span>
        <span className="ml-3 inline-flex items-center gap-1.5 px-2 py-0.5"
          style={{ background: 'hsl(var(--accent-weak))', borderRadius: 3, color: 'hsl(var(--accent))' }}>
          <ModuleIcon className="h-3 w-3" />
          {moduleMeta.mono}
        </span>
      </nav>

      {/* Title */}
      <h1 className="app-page-title mb-5 text-[28px]">{searchQuery}</h1>

      {/* Meta bar — sharp grid */}
      <div
        className="grid grid-cols-2 md:grid-cols-5 gap-px mb-4 overflow-hidden"
        style={{ background: 'hsl(var(--border))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
      >
        <MetaCell label="запрос" value={searchQuery} mono={false} truncate />
        <MetaCell label="источник" value={searchProvider} />
        <MetaCell label="статус" value={statusLabel} valueColor={statusColor} />
        <MetaCell label="найдено" value={String(results.length)} bold />
        <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ background: 'hsl(var(--surface))' }}>
          <div>
            <div className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>обновлено</div>
            <div className="text-[14px] font-semibold mt-1" style={{ color: 'hsl(var(--text))' }}>
              {lastUpdated ? lastUpdated.toLocaleTimeString('ru-RU') : '—'}
            </div>
          </div>
          {results.length > 0 && (
            <a
              href={`/api/v1/searches/${runId}/results/export/csv`}
              download
              className="inline-flex items-center gap-1.5 h-9 px-3 text-[12px] font-bold transition-colors hover:bg-[hsl(var(--accent-weak))]"
              style={{
                background: 'hsl(var(--surface-2))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 4,
                color: 'hsl(var(--text))',
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Download className="h-4 w-4" /> CSV
            </a>
          )}
        </div>
      </div>

      {/* Progress */}
      {isProcessing && (
        <ProgressPanel
          accent="hsl(var(--accent))"
          title="Сбор результатов"
          subtitle={`найдено ${results.length} из ${expectedResults}`}
          percent={progressPercent}
        />
      )}
      {isBackgroundProcessing && (
        <ProgressPanel
          accent="hsl(var(--indigo))"
          title="Обработка результатов"
          subtitle={`обработано ${processedCount} из ${results.length} (краулинг, контакты)`}
          percent={backgroundProgressPercent}
        />
      )}

      {/* Error state */}
      {searchStatus === 'failed' && (
        <div className="mb-4 p-4" style={{ background: 'hsl(var(--danger) / 0.08)', border: '1px solid hsl(var(--danger) / 0.3)', borderRadius: 6 }}>
          <h3 className="text-[13px] font-bold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--danger))' }}>Поиск не удался</h3>
          <p className="text-[14px]" style={{ color: 'hsl(var(--danger))' }}>{typeof configError === 'string' ? configError : 'Неизвестная ошибка'}</p>
          {typeof configErrorType === 'string' && (
            <p className="mt-1 app-mono-label" style={{ color: 'hsl(var(--danger))' }}>тип: {configErrorType}</p>
          )}
        </div>
      )}

      {/* Timeout */}
      {pollTimeout && (
        <div className="mb-4 p-4" style={{ background: 'hsl(var(--warning) / 0.08)', border: '1px solid hsl(var(--warning) / 0.3)', borderRadius: 6 }}>
          <h3 className="text-[13px] font-bold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--warning))' }}>Слишком долго</h3>
          <p className="text-[13px]" style={{ color: 'hsl(var(--text))' }}>
            Обновление остановлено по тайм-ауту (5 минут). Обновите страницу или попробуйте другой источник.
          </p>
        </div>
      )}

      {results.length === 0 && !isProcessing && searchStatus === 'completed' && (
        <div className="py-12 text-center" style={{ color: 'hsl(var(--muted))' }}>
          Результаты не найдены
        </div>
      )}

      {/* Module-specific table */}
      {moduleId === 'leads' || moduleId === 'tenders' ? (
        <LeadsResultsTable results={results} runId={runId} />
      ) : (
        <LeadsTable
          results={results}
          runId={runId}
          onAuditComplete={() => {
            auditUntilRef.current = Date.now() + AUDIT_POLLING_GRACE_MS;
            setRefreshTrigger((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function MetaCell({ label, value, valueColor, bold, mono = true, truncate }: { label: string; value: string; valueColor?: string; bold?: boolean; mono?: boolean; truncate?: boolean }) {
  return (
    <div className="px-4 py-3" style={{ background: 'hsl(var(--surface))' }}>
      <div className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>{label}</div>
      <div
        className={truncate ? 'truncate' : ''}
        style={{
          color: valueColor ?? 'hsl(var(--text))',
          fontWeight: bold ? 800 : 600,
          fontSize: 14,
          marginTop: 4,
          fontFamily: mono ? 'JetBrains Mono, ui-monospace, monospace' : undefined,
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function ProgressPanel({ title, subtitle, percent, accent }: { title: string; subtitle: string; percent: number; accent: string }) {
  return (
    <div className="mb-4 px-4 py-3" style={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-bold" style={{ color: 'hsl(var(--text))' }}>{title}</span>
        <span className="app-mono-label" style={{ color: accent }}>{percent}%</span>
      </div>
      <div className="w-full h-1.5 overflow-hidden" style={{ background: 'hsl(var(--border))', borderRadius: 2 }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%`, background: accent }}
        />
      </div>
      <p className="mt-2 app-mono-label" style={{ color: 'hsl(var(--muted))' }}>{subtitle}</p>
    </div>
  );
}
