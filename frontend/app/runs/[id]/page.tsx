'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { LeadsTable } from '@/components/LeadsTable';
import { ProcessStepsIndicator } from '@/components/ProcessStepsIndicator';
import { getSearch, getSearchResults } from '@/src/services/api/search';
import type { LeadRow } from '@/lib/types';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут

export default function RunResultsPage() {
  const params = useParams();
  const runId = params.id as string;
  const processingStartedAt = useRef<number | null>(null);

  const [results, setResults] = useState<LeadRow[]>([]);
  const [search, setSearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);
  const [pollTimeout, setPollTimeout] = useState(false);

  useEffect(() => {
    processingStartedAt.current = null;
    setPollTimeout(false);
  }, [runId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const searchId = parseInt(runId);
        if (isNaN(searchId)) {
          setError('Неверный ID запуска');
          setLoading(false);
          return;
        }

        const searchData = await getSearch(searchId);
        setSearch(searchData);

        const resultsData = await getSearchResults(searchId);
        const convertedResults: LeadRow[] = resultsData.map((result: any) => {
          const status: 'ok' | 'error' =
            result.contact_status === 'found' || result.contact_status === 'no_contacts' ? 'ok' : 'error';
          return {
            id: String(result.id),
            domain: result.domain || '',
            phone: result.phone ?? null,
            email: result.email ?? null,
            score: result.seo_score ?? 0,
            issues: { robots: true, sitemap: true, titleDuplicates: true, descriptionDuplicates: true },
            status,
            outreachText: result.outreach_text || '',
          };
        });
        setResults(convertedResults);

        if (searchData.status === 'completed' || searchData.status === 'failed') {
          setPolling(false);
          return;
        }

        // pending / processing: проверка таймаута опроса
        if (searchData.status === 'pending' || searchData.status === 'processing') {
          if (processingStartedAt.current === null) processingStartedAt.current = Date.now();
          if (Date.now() - (processingStartedAt.current || 0) > POLL_TIMEOUT_MS) {
            setPolling(false);
            setPollTimeout(true);
          }
        }
      } catch (err: any) {
        console.error('Error fetching search data:', err);
        setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке результатов');
        setPolling(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    if (!polling) return;
    const t = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [runId, polling]);

  if (loading && !search) {
    return (
      <div className="max-w-[1250px] mx-auto px-6 py-8">
        <div className="flex flex-col items-center gap-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
          <p className="text-gray-600 dark:text-gray-400">Загрузка…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1250px] mx-auto px-6 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  const searchQuery = search?.query || 'Запрос';
  const searchProvider = search?.search_provider || 'duckduckgo';
  const searchStatus = search?.status || 'unknown';
  const resultCount = search?.result_count || 0;
  const configError = search?.config && typeof search.config === 'object' ? search.config.error : null;
  const configErrorType = search?.config && typeof search.config === 'object' ? search.config.error_type : null;
  const isProcessing = searchStatus === 'processing' || searchStatus === 'pending';

  return (
    <div className="max-w-[1250px] mx-auto px-6">
      {/* Блок: запрос, провайдер, статус, кол-во */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
          <div><span className="font-medium">Запрос:</span> {searchQuery}</div>
          <div><span className="font-medium">Провайдер:</span> {searchProvider}</div>
          <div><span className="font-medium">Статус:</span> {searchStatus}</div>
          <div><span className="font-medium">Найдено результатов:</span> {resultCount}</div>
          {isProcessing && !pollTimeout && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Обновление каждые 3 сек</span>
            </div>
          )}
          {searchStatus === 'failed' && (
            <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">Ошибка</span>
          )}
        </div>
      </div>

      {/* Ошибка: поиск не удался — причина из бэкенда */}
      {searchStatus === 'failed' && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <h3 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-200">Поиск не удался</h3>
          <p className="text-red-700 dark:text-red-300">{configError || 'Неизвестная ошибка'}</p>
          {configErrorType && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Тип: {configErrorType}</p>}
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Часто Яндекс/Google блокируют запросы с серверов или показывают капчу. Попробуйте DuckDuckGo или Яндекс XML с API-ключами.
          </p>
        </div>
      )}

      {/* Таймаут опроса: долго в processing */}
      {pollTimeout && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">Поиск занимает необычно много времени</h3>
          <p className="text-amber-700 dark:text-amber-300">
            Выбранная поисковая система может быть перегружена или блокировать запросы. Обновление остановлено через 5 минут.
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Обновите страницу позже или запустите новый поиск с другим провайдером (например, DuckDuckGo).
          </p>
        </div>
      )}

      {/* Этапы процесса — анимация, когда идёт поиск */}
      {isProcessing && !pollTimeout && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <ProcessStepsIndicator title="Идёт сбор результатов…" />
        </div>
      )}

      {/* Результаты не найдены (успешное завершение, 0 результатов) */}
      {searchStatus === 'completed' && results.length === 0 && (
        <div className="py-8 text-center text-gray-600 dark:text-gray-400">Результаты не найдены</div>
      )}

      {/* Таблица результатов */}
      {results.length > 0 && <LeadsTable results={results} runId={runId} />}
    </div>
  );
}
