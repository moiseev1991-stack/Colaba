'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { LeadsTable } from '@/components/LeadsTable';
import { PageHeader } from '@/components/PageHeader';
import { getSearch, getSearchResults } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import type { LeadRow } from '@/lib/types';
import { mapExtraDataToSeo, mapExtraDataToIssues } from '@/lib/searchResultMapping';
import { Download } from 'lucide-react';

/**
 * Adaptive polling intervals:
 * - 0-30 s  → 2 s (fast, for live progress)
 * - 30-90 s → 4 s
 * - 90 s+   → 8 s (slow, likely waiting for a long task)
 */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const AUDIT_POLLING_GRACE_MS = 3 * 60 * 1000;

function getAdaptiveInterval(elapsedMs: number): number {
  if (elapsedMs > 90_000) return 8_000;
  if (elapsedMs > 30_000) return 4_000;
  return 2_000;
}

export default function RunResultsPage() {
  const params = useParams();
  const runId = params.id as string;

  const [results, setResults] = useState<LeadRow[]>([]);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollTimeout, setPollTimeout] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Polling control refs (no re-render needed)
  const activeRef = useRef(true);             // component still mounted & wants polling
  const processingStartRef = useRef<number | null>(null);
  const auditUntilRef = useRef<number>(0);
  const lastCountRef = useRef<number>(-1);    // last known result_count
  const lastStatusRef = useRef<string>('');   // last known status
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on runId change
  useEffect(() => {
    activeRef.current = true;
    processingStartRef.current = null;
    lastCountRef.current = -1;
    lastStatusRef.current = '';
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

        // Only fetch results if something changed (saves bandwidth on large result sets)
        const countChanged = searchData.result_count !== lastCountRef.current;
        const statusChanged = searchData.status !== lastStatusRef.current;
        const auditActive = Date.now() < auditUntilRef.current;
        const needsResults = countChanged || statusChanged || auditActive || lastCountRef.current === -1;

        if (needsResults) {
          const resultsData = await getSearchResults(searchId);
          if (!activeRef.current) return;

          const rows: LeadRow[] = resultsData.map((r) => {
            const status: 'ok' | 'error' | 'processing' =
              r.contact_status === 'found' || r.contact_status === 'no_contacts' ? 'ok'
                : r.contact_status === 'failed' ? 'error'
                  : 'processing';
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
            };
          });
          setResults(rows);
          setLastUpdated(new Date());
          lastCountRef.current = searchData.result_count;
          lastStatusRef.current = searchData.status;
        }

        // Stop when finished
        if ((searchData.status === 'completed' || searchData.status === 'failed') && !auditActive) {
          return; // no reschedule
        }

        // Timeout guard
        if (searchData.status === 'pending' || searchData.status === 'processing') {
          if (processingStartRef.current === null) processingStartRef.current = Date.now();
          const elapsed = Date.now() - (processingStartRef.current ?? 0);
          if (elapsed > POLL_TIMEOUT_MS) {
            setPollTimeout(true);
            return;
          }
          schedule(getAdaptiveInterval(elapsed));
        } else {
          // unknown status — keep a slow poll
          schedule(8_000);
        }
      } catch {
        // Retry on transient errors
        if (activeRef.current) schedule(5_000);
      } finally {
        if (activeRef.current) setLoading(false);
      }
    };

    tick(); // immediate first fetch

    return () => {
      activeRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [runId, refreshTrigger]);

  if (loading && !search) {
    return (
      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 py-6">
        <div className="text-center text-gray-600 dark:text-gray-400">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1250px] mx-auto px-6 py-8">
        <div className="rounded-[14px] border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  const searchQuery = search?.query || 'Запрос';
  const searchProvider = search?.search_provider || 'не указан';
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

  return (
    <div className="w-full max-w-[1250px] mx-auto px-4 md:px-6 min-w-0 overflow-x-hidden">
      <PageHeader
        breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'История', href: '/runs' }, { label: 'Результаты' }]}
        title={searchQuery || 'Результаты поиска'}
      />

      {/* Meta bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
          <div><span className="font-medium">Запрос:</span> {searchQuery}</div>
          <div><span className="font-medium">Провайдер:</span> {searchProvider}</div>
          <div><span className="font-medium">Статус:</span> {isProcessing ? 'Обработка...' : searchStatus}</div>
          <div><span className="font-medium">Найдено:</span> {results.length}</div>
          {lastUpdated && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Обновлено: {lastUpdated.toLocaleTimeString('ru-RU')}
            </div>
          )}
        </div>
        {results.length > 0 && (
          <a
            href={`/api/v1/searches/${runId}/results/export/csv`}
            download
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        )}
      </div>

      {/* Progress bar */}
      {isProcessing && (
        <div className="mb-4 rounded-[14px] border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Сбор результатов...</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Найдено {results.length} из {expectedResults} результатов
          </p>
        </div>
      )}

      {/* Error state */}
      {searchStatus === 'failed' && (
        <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <h3 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-200">Поиск не удался</h3>
          <p className="text-red-700 dark:text-red-300">{typeof configError === 'string' ? configError : 'Неизвестная ошибка'}</p>
          {typeof configErrorType === 'string' && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Тип: {configErrorType}</p>
          )}
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Часто Яндекс/Google блокируют запросы с серверов. Попробуйте DuckDuckGo или Яндекс XML с API-ключами.
          </p>
        </div>
      )}

      {/* Timeout warning */}
      {pollTimeout && (
        <div className="mb-4 rounded-[14px] border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">Поиск занимает необычно долго</h3>
          <p className="text-amber-700 dark:text-amber-300">
            Обновление данных остановлено по тайм-ауту (5 минут). Обновите страницу или попробуйте другой провайдер.
          </p>
        </div>
      )}

      {results.length === 0 && !isProcessing && searchStatus === 'completed' && (
        <div className="py-8 text-center text-gray-600 dark:text-gray-400">Результаты не найдены</div>
      )}

      <LeadsTable
        results={results}
        runId={runId}
        onAuditComplete={() => {
          auditUntilRef.current = Date.now() + AUDIT_POLLING_GRACE_MS;
          setRefreshTrigger((t) => t + 1);
        }}
      />
    </div>
  );
}
