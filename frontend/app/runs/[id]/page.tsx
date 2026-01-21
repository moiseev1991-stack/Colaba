'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SearchForm from '@/components/SearchForm';
import { SearchControls } from '@/components/SearchControls';
import { ModuleCards } from '@/components/ModuleCards';
import { ResultsTabs } from '@/components/ResultsTabs';
import { LeadsTable } from '@/components/LeadsTable';
import { getRun, getRunResults } from '@/lib/storage';
import type { Run, LeadRow } from '@/lib/types';

export default function RunResultsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('');
  const [engine, setEngine] = useState('yandex');

  useEffect(() => {
    const runData = getRun(runId);
    if (!runData) {
      router.push('/');
      return;
    }
    
    setRun(runData);
    setCity(runData.geoCity);
    setEngine(runData.engine);
    const runResults = getRunResults(runId);
    setResults(runResults);
    setLoading(false);
  }, [runId, router]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 dark:text-gray-400">Запуск не найден</p>
        <button onClick={() => router.push('/')} className="mt-4 text-red-600 hover:underline">
          Назад
        </button>
      </div>
    );
  }

  return (
    <>
      <SearchControls 
        city={city}
        engine={engine}
        onCityChange={setCity}
        onEngineChange={setEngine}
      />
      
      <div className="space-y-8">
        <div className="space-y-6">
          <SearchForm 
            initialKeyword={run.keyword}
            showButton={false}
          />
          <ModuleCards activeModule="seo" />
        </div>
        
        <ResultsTabs activeTab="seo" />
        
        <LeadsTable results={results} runId={runId} />
      </div>
    </>
  );
}
