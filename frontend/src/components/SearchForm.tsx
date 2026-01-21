'use client';

import { useState } from 'react';
import { createSearch } from '@/services/api/search';

export default function SearchForm() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchId, setSearchId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const search = await createSearch({
        query: query.trim(),
        search_provider: 'serpapi',
        num_results: 50,
      });
      setSearchId(search.id);
      // Redirect to results page
      window.location.href = `/results?id=${search.id}`;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка при создании поиска');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      <div className="flex gap-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Введите запрос…"
          className="flex-1 max-w-4xl bg-gray-700 text-white px-4 py-3 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {loading ? 'Поиск...' : 'Найти'}
        </button>
      </div>
      {error && (
        <div className="mt-2 text-red-400 text-sm">
          {error}
        </div>
      )}
    </form>
  );
}
