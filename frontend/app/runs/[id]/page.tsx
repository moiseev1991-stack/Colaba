'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LeadsTable } from '@/components/LeadsTable';
import { getSearch, getSearchResults, type SearchResponse, type SearchResultResponse } from '@/search';
import type { LeadRow } from '@/lib/types';

export default function RunResultsPage() {
  const params = useParams();
  const router = useRouter();
  const searchId = parseInt(params.id as string);
  
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [results, setResults] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Convert SearchResultResponse to LeadRow
  const convertToLeadRow = (result: SearchResultResponse): LeadRow => {
    return {
      id: result.id.toString(),
      domain: result.domain || new URL(result.url).hostname,
      phone: null, // Will be populated when domain is processed
      email: null, // Will be populated when domain is processed
      score: 0, // Will be populated when SEO audit is done
      issues: {
        robots: true, // Will be populated from audit
        sitemap: true,
        titleDuplicates: true,
        descriptionDuplicates: true,
      },
      status: 'ok',
      outreachText: '', // Will be populated when domain is processed
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      if (isNaN(searchId)) {
        setError('Неверный ID поиска');
        setLoading(false);
        return;
      }

      try {
        // Fetch search info
        const searchData = await getSearch(searchId);
        setSearch(searchData);

        // Fetch results
        const searchResults = await getSearchResults(searchId);
        const leadRows = searchResults.map(convertToLeadRow);
        setResults(leadRows);

        // If search is still pending/processing, start polling
        if (searchData.status === 'pending' || searchData.status === 'processing') {
          setPolling(true);
        } else {
          setPolling(false);
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Error fetching search data:', err);
        setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке результатов');
        setLoading(false);
      }
    };

    fetchData();
  }, [searchId]);

  // Poll for updates if search is still processing
  useEffect(() => {
    if (!polling || isNaN(searchId)) return;

    const interval = setInterval(async () => {
      try {
        const searchData = await getSearch(searchId);
        setSearch(searchData);

        const searchResults = await getSearchResults(searchId);
        const leadRows = searchResults.map(convertToLeadRow);
        setResults(leadRows);

        // Stop polling if search is completed
        if (searchData.status === 'completed' || searchData.status === 'error') {
          setPolling(false);
        }
      } catch (err) {
        console.error('Error polling search:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [polling, searchId]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Загрузка результатов...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button onClick={() => router.push('/')} className="text-red-600 hover:underline">
          Назад
        </button>
      </div>
    );
  }

  if (!search) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 dark:text-gray-400">Поиск не найден</p>
        <button onClick={() => router.push('/')} className="mt-4 text-red-600 hover:underline">
          Назад
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1250px] mx-auto px-6">
      {/* Search Info */}
      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Запрос: {search.query}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Провайдер: {search.search_provider === 'duckduckgo' ? 'DuckDuckGo' : 
                          search.search_provider === 'yandex_xml' ? 'Яндекс XML' : 
                          search.search_provider}
            </p>
          </div>
          <div className="text-right">
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              search.status === 'completed' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : search.status === 'processing' || search.status === 'pending'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
            }`}>
              {search.status === 'completed' ? 'Завершено' :
               search.status === 'processing' ? 'Обработка...' :
               search.status === 'pending' ? 'Ожидание...' :
               'Ошибка'}
            </div>
            {polling && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Обновление каждые 3 сек...
              </p>
            )}
          </div>
        </div>
        {search.result_count !== undefined && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Найдено результатов: {search.result_count}
          </p>
        )}
      </div>

      {/* Results Table */}
      {results.length > 0 ? (
        <LeadsTable results={results} runId={search.id.toString()} />
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            {search.status === 'pending' || search.status === 'processing'
              ? 'Ожидание результатов...'
              : 'Результаты не найдены'}
          </p>
        </div>
      )}
    </div>
  );
}
