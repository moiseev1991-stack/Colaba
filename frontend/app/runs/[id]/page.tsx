'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LeadsTable } from '@/components/LeadsTable';
import { getSearch, getSearchResults } from '@/src/services/api/search';
import type { LeadRow } from '@/lib/types';

export default function RunResultsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  
  const [results, setResults] = useState<LeadRow[]>([]);
  const [search, setSearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const searchId = parseInt(runId);
        if (isNaN(searchId)) {
          setError('Invalid search ID');
          setLoading(false);
          return;
        }

        // Get search info
        const searchData = await getSearch(searchId);
        setSearch(searchData);

        // Get results
        const resultsData = await getSearchResults(searchId);
        
        // Convert API results to LeadRow format
        const convertedResults: LeadRow[] = resultsData.map((result: any) => ({
          id: result.id,
          position: result.position,
          title: result.title,
          url: result.url,
          domain: result.domain || '',
          snippet: result.snippet || '',
          seoScore: result.seo_score,
          phone: result.phone,
          email: result.email,
          contactStatus: result.contact_status,
          outreachSubject: result.outreach_subject,
          outreachText: result.outreach_text,
        }));
        
        setResults(convertedResults);

        // Stop polling if search is completed or failed
        if (searchData.status === 'completed' || searchData.status === 'failed') {
          setPolling(false);
        }
      } catch (err: any) {
        console.error('Error fetching search data:', err);
        setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке результатов');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Poll for updates if search is still processing
    if (polling) {
      const interval = setInterval(() => {
        fetchData();
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(interval);
    }
  }, [runId, polling]);

  if (loading) {
    return (
      <div className="max-w-[1250px] mx-auto px-6 text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Загрузка результатов...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1250px] mx-auto px-6 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  const searchQuery = search?.query || 'Запрос';
  const searchProvider = search?.search_provider || 'duckduckgo';
  const searchStatus = search?.status || 'unknown';
  const resultCount = search?.result_count || 0;

  return (
    <div className="max-w-[1250px] mx-auto px-6">
      {/* Search Query Block */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
          <div>
            <span className="font-medium">Запрос:</span> {searchQuery}
          </div>
          <div>
            <span className="font-medium">Провайдер:</span> {searchProvider}
          </div>
          <div>
            <span className="font-medium">Статус:</span> {searchStatus}
          </div>
          <div>
            <span className="font-medium">Найдено результатов:</span> {resultCount}
          </div>
          {searchStatus === 'processing' && (
            <div className="flex items-center gap-2">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Обновление каждые 3 сек...</span>
            </div>
          )}
          {searchStatus === 'failed' && (
            <div className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded text-xs">
              Ошибка
            </div>
          )}
        </div>
      </div>

      {results.length === 0 && searchStatus === 'completed' && (
        <div className="text-center py-8 text-gray-600 dark:text-gray-400">
          Результаты не найдены
        </div>
      )}

      {results.length > 0 && (
        <LeadsTable results={results} runId={runId} />
      )}
    </div>
  );
}
