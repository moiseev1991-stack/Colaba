'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LeadsTable } from '@/components/LeadsTable';
import { getRunResults, getRun } from '@/lib/storage';
import { generateMockResults } from '@/lib/mock';
import type { LeadRow, Run } from '@/lib/types';

export default function RunResultsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  
  const [results, setResults] = useState<LeadRow[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Get run info
    const runData = getRun(runId);
    setRun(runData);

    // Try to get results from storage
    const storedResults = getRunResults(runId);
    
    if (storedResults && storedResults.length > 0) {
      setResults(storedResults);
    } else {
      // Generate mock results for demo
      const mockResults = generateMockResults(10);
      setResults(mockResults);
    }
    
    setLoading(false);
  }, [runId]);

  if (loading) {
    return (
      <div className="max-w-[1250px] mx-auto px-6 text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Загрузка результатов...</p>
      </div>
    );
  }

  const searchQuery = run?.keyword || 'Пример запроса';

  return (
    <div className="max-w-[1250px] mx-auto px-6">
      {/* Search Query Block */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">Запрос:</span> {searchQuery}
        </div>
      </div>

      <LeadsTable results={results} runId={runId} />
    </div>
  );
}
