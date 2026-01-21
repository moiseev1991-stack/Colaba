'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSearch, getSearchResults, SearchResponse, SearchResultResponse } from '@/services/api/search';

function ResultsContent() {
  const searchParams = useSearchParams();
  const searchId = searchParams.get('id');
  
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [results, setResults] = useState<SearchResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchId) {
      setError('ID поиска не указан');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const [searchData, resultsData] = await Promise.all([
          getSearch(Number(searchId)),
          getSearchResults(Number(searchId)),
        ]);
        setSearch(searchData);
        setResults(resultsData);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Ошибка при загрузке результатов');
        console.error('Load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [searchId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-red-600 h-[200px] flex items-center px-4">
        <div className="container mx-auto">
          <h1 className="text-white text-2xl font-bold">LeadGen Constructor</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <a href="/" className="text-blue-400 hover:text-blue-300">← Назад</a>
        </div>

        {search && (
          <div className="mb-8">
            <h2 className="text-4xl font-bold text-white mb-4">Результаты поиска</h2>
            <div className="text-gray-400 mb-2">
              <strong>Запрос:</strong> {search.query}
            </div>
            <div className="text-gray-400 mb-2">
              <strong>Статус:</strong> <span className="text-white">{search.status}</span>
            </div>
            <div className="text-gray-400">
              <strong>Найдено результатов:</strong> {search.result_count}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {results.length === 0 ? (
            <div className="text-gray-400 text-center py-12">
              Результаты пока не найдены. Поиск может быть еще в процессе.
            </div>
          ) : (
            results.map((result) => (
              <div
                key={result.id}
                className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-xl font-semibold text-white flex-1">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-400 transition-colors"
                    >
                      {result.title}
                    </a>
                  </h3>
                  <span className="text-gray-500 text-sm ml-4">#{result.position}</span>
                </div>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm mb-2 block"
                >
                  {result.url}
                </a>
                {result.snippet && (
                  <p className="text-gray-300 mt-2">{result.snippet}</p>
                )}
                {result.domain && (
                  <div className="mt-2 text-gray-500 text-sm">
                    Домен: {result.domain}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
