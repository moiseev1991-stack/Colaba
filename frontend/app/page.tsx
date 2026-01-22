'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchCard } from '@/components/SearchCard';
import { saveRun, saveRunResults } from '@/lib/storage';
import { generateMockResults } from '@/lib/mock';

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [city, setCity] = useState('');
  const [activeModule, setActiveModule] = useState<'seo' | 'contacts' | 'prices'>('seo');

  const handleSearch = async (keyword: string) => {
    if (!city) return;
    
    // Don't allow search for disabled modules
    if (activeModule !== 'seo') return;
    
    setIsLoading(true);
    
    // Simulate loading
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Create run
    const runId = Date.now().toString();
    const run = {
      id: runId,
      keyword,
      geoCity: city,
      engine: 'yandex',
      createdAt: Date.now(),
      status: 'done' as const,
      resultCount: 20,
    };
    
    // Generate mock results
    const results = generateMockResults(20);
    
    // Save to localStorage
    saveRun(run);
    saveRunResults(runId, results);
    
    setIsLoading(false);
    
    // Redirect to results
    router.push(`/runs/${runId}`);
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
            <p className="mt-2 text-gray-600 dark:text-gray-400">Поиск...</p>
          </div>
        )}
      </div>
    </div>
  );
}
