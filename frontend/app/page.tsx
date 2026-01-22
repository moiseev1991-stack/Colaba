'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchCard } from '@/components/SearchCard';
import { createSearch } from '@/search';

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [activeModule, setActiveModule] = useState<'seo' | 'contacts' | 'prices'>('seo');

  const handleSearch = async (keyword: string, searchProvider: string) => {
    if (!city) return;
    
    // Don't allow search for disabled modules
    if (activeModule !== 'seo') return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Create search using real API
      const search = await createSearch({
        query: `${keyword} ${city}`,
        search_provider: searchProvider,
        num_results: 50,
      });
      
      setIsLoading(false);
      
      // Redirect to results page
      // Note: The backend will process the search in background via Celery
      router.push(`/runs/${search.id}`);
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.detail || err.message || 'Ошибка при создании поиска');
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="space-y-6">
        {/* Search Card with Integrated Tabs */}
        <SearchCard 
          city={city}
          onCityChange={setCity}
          onSubmit={handleSearch}
          activeModule={activeModule}
          onModuleChange={setActiveModule}
        />
        
        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Создание поиска...</p>
          </div>
        )}
        
        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
