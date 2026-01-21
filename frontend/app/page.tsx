'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SearchForm from '@/components/SearchForm';
import { SearchControls } from '@/components/SearchControls';
import { ModuleCards } from '@/components/ModuleCards';
import { saveRun, saveRunResults } from '@/lib/storage';
import { generateMockResults } from '@/lib/mock';

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [city, setCity] = useState('');
  const [engine, setEngine] = useState('yandex');

  const handleSearch = async (keyword: string) => {
    if (!city) return;
    
    setIsLoading(true);
    
    // Simulate loading
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Create run
    const runId = Date.now().toString();
    const run = {
      id: runId,
      keyword,
      geoCity: city,
      engine: engine,
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
    <>
      <SearchControls 
        city={city}
        engine={engine}
        onCityChange={setCity}
        onEngineChange={setEngine}
      />
      
      <div className="space-y-8">
        <h2 className="text-4xl font-bold text-gray-900 dark:text-white">Ввод</h2>
        
        <SearchForm onSubmit={handleSearch} />
        
        {isLoading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Поиск...</p>
          </div>
        )}
        
        <ModuleCards activeModule="seo" />
      </div>
    </>
  );
}
