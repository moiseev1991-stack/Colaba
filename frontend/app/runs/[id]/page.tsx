'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { LeadsTable } from '@/components/LeadsTable';
import { PageHeader } from '@/components/PageHeader';
import { getSearch, getSearchResults } from '@/src/services/api/search';
import type { LeadRow } from '@/lib/types';
import { mapExtraDataToSeo, mapExtraDataToIssues } from '@/lib/searchResultMapping';

const POLL_INTERVAL_MS = 1500; // Опрос каждые 1.5 сек
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут
const AUDIT_POLLING_GRACE_MS = 3 * 60 * 1000; // после старта аудита — polling ещё 3 мин

export default function RunResultsPage() {
  const params = useParams();
  const runId = params.id as string;
  const processingStartedAt = useRef<number | null>(null);

  const [results, setResults] = useState<LeadRow[]>([]);
  const [search, setSearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollTimeout, setPollTimeout] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(true);
  const isMountedRef = useRef(true);
  const auditPollingUntilRef = useRef<number>(0); // до этой метки продолжаем polling (SEO-аудит в работе)

  useEffect(() => {
    processingStartedAt.current = null;
    setPollTimeout(false);
    pollingRef.current = true; // Сбрасываем при новом runId
    isMountedRef.current = true;
  }, [runId]);

  useEffect(() => {
    // Очистка интервала при размонтировании или изменении runId
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [runId]);

  useEffect(() => {
    isMountedRef.current = true;
    if (Date.now() < auditPollingUntilRef.current) {
      pollingRef.current = true; // SEO-аудит в работе — продолжаем polling
    }

    const fetchData = async () => {
      // Проверяем polling через ref перед каждым запросом
      if (!pollingRef.current) {
        return;
      }

      try {
        const searchId = parseInt(runId);
        if (isNaN(searchId)) {
          setError('Неверный ID запуска');
          setLoading(false);
          pollingRef.current = false;
          return;
        }

        const searchData = await getSearch(searchId);
        if (!isMountedRef.current) return;
        
        setSearch(searchData);

        const resultsData = await getSearchResults(searchId);
        if (!isMountedRef.current) return;
        
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[Poll] Search ${searchId}: status=${searchData.status}, results=${resultsData.length}`);
        }
        
        const convertedResults: LeadRow[] = resultsData.map((result: any) => {
          const status: 'ok' | 'error' | 'processing' =
            result.contact_status === 'found' || result.contact_status === 'no_contacts'
              ? 'ok'
              : result.contact_status === 'failed'
                ? 'error'
                : 'processing';
          return {
            id: String(result.id),
            domain: result.domain || '',
            phone: result.phone ?? null,
            email: result.email ?? null,
            score: result.seo_score ?? 0,
            issues: mapExtraDataToIssues(result.extra_data),
            seo: mapExtraDataToSeo(result.extra_data),
            status,
            outreachText: result.outreach_text || '',
            titleFromSearch: result.title ?? null,
            snippetFromSearch: result.snippet ?? null,
            urlFromSearch: result.url ?? null,
          };
        });
        setResults(convertedResults);
        setLastUpdated(new Date());

        // Если поиск завершен или провалился — останавливаем опрос, КРОМЕ случая когда идёт SEO-аудит
        const auditGraceActive = Date.now() < auditPollingUntilRef.current;
        if ((searchData.status === 'completed' || searchData.status === 'failed') && !auditGraceActive) {
          pollingRef.current = false;
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          return;
        }

        // pending / processing: проверка таймаута опроса
        if (searchData.status === 'pending' || searchData.status === 'processing') {
          if (processingStartedAt.current === null) processingStartedAt.current = Date.now();
          if (Date.now() - (processingStartedAt.current || 0) > POLL_TIMEOUT_MS) {
            pollingRef.current = false;
            setPollTimeout(true);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        }
      } catch (err: any) {
        console.error('Error fetching search data:', err);
        // При ошибке не останавливаем опрос - возможно временная проблема
        console.warn('Polling error (continuing):', err.message);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    // Первый запрос сразу
    fetchData();

    // Запускаем опрос сразу - интервал будет вызывать fetchData каждую секунду
    pollIntervalRef.current = setInterval(() => {
      if (pollingRef.current && isMountedRef.current) {
        fetchData();
      } else {
        // Если polling остановлен, очищаем интервал
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    }, POLL_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
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
  const configError = search?.config && typeof search.config === 'object' ? search.config.error : null;
  const configErrorType = search?.config && typeof search.config === 'object' ? search.config.error_type : null;
  const isProcessing = searchStatus === 'processing' || searchStatus === 'pending';
  
  // Вычисляем прогресс на основе количества результатов (если есть ожидаемое количество)
  const expectedResults = search?.num_results || 100;
  const progressPercent = isProcessing && expectedResults > 0 
    ? Math.min(100, Math.round((results.length / expectedResults) * 100))
    : searchStatus === 'completed' ? 100 : 0;

  return (
    <div className="w-full max-w-[1250px] mx-auto px-4 md:px-6 min-w-0 overflow-x-hidden">
      <PageHeader
        breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'История', href: '/runs' }, { label: 'Результаты' }]}
        title={searchQuery ? searchQuery : 'Результаты поиска'}
      />
      {/* Мета: запрос, провайдер, статус — всегда показываем */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
          <div><span className="font-medium">Запрос:</span> {searchQuery}</div>
          <div><span className="font-medium">Провайдер:</span> {searchProvider}</div>
          <div><span className="font-medium">Статус:</span> {isProcessing ? 'Обработка...' : searchStatus}</div>
          <div><span className="font-medium">Найдено результатов:</span> {results.length}</div>
          {lastUpdated && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Обновлено: {lastUpdated.toLocaleTimeString('ru-RU')}
            </div>
          )}
          {searchStatus === 'failed' && (
            <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">Ошибка</span>
          )}
        </div>
      </div>

      {/* Прогресс-бар во время обработки */}
      {isProcessing && (
        <div className="mb-4 rounded-[14px] border border-gray-200 bg-white dark:bg-gray-800 px-4 py-3 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Сбор результатов...
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {progressPercent}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-saas-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Найдено {results.length} из {expectedResults} результатов
          </p>
        </div>
      )}

      {/* Ошибка: поиск не удался — причина из бэкенда */}
      {searchStatus === 'failed' && (
        <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <h3 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-200">Поиск не удался</h3>
          <p className="text-red-700 dark:text-red-300">{configError || 'Неизвестная ошибка'}</p>
          {configErrorType && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Тип: {configErrorType}</p>}
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Часто Яндекс/Google блокируют запросы с серверов или показывают капчу. Попробуйте DuckDuckGo или Яндекс XML с API-ключами.
          </p>
        </div>
      )}

      {/* Таймаут опроса: долго в processing (мета уже показана выше, т.к. !isProcessing) */}
      {pollTimeout && (
        <div className="mb-4 rounded-[14px] border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">Поиск занимает необычно много времени</h3>
          <p className="text-amber-700 dark:text-amber-300">
            Выбранная поисковая система может быть перегружена или блокировать запросы. Обновление остановлено через 5 минут.
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Обновите страницу позже или запустите новый поиск с другим провайдером (например, DuckDuckGo).
          </p>
        </div>
      )}

      {/* Таблица результатов — показываем сразу, постепенно заполняется */}
      {results.length === 0 && !isProcessing && searchStatus === 'completed' && (
        <div className="py-8 text-center text-gray-600 dark:text-gray-400">Результаты не найдены</div>
      )}

      {/* Таблица результатов — показываем сразу, даже если обработка ещё идёт */}
      <LeadsTable
        results={results}
        runId={runId}
        onAuditComplete={() => {
          setRefreshTrigger((t) => t + 1);
          auditPollingUntilRef.current = Date.now() + AUDIT_POLLING_GRACE_MS;
        }}
      />
    </div>
  );
}
