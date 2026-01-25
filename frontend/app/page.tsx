'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SearchCard } from '@/components/SearchCard';
import { LoadingProcessPanel } from '@/components/LoadingProcessPanel';
import { ActivityTable } from '@/components/ActivityTable';
import { tokenStorage } from '@/client';
import { createSearch } from '@/src/services/api/search';
import { ToastContainer, type Toast } from '@/components/Toast';

const TOTAL_DURATION_MS = 10_000;
const PROGRESS_TICK_MS = 100;
const DONE_DELAY_MS = 1_000;
const NUM_RESULTS = 100;

function stepFromProgress(p: number): number {
  if (p >= 75) return 3;
  if (p >= 50) return 2;
  if (p >= 25) return 1;
  return 0;
}

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [activeModule, setActiveModule] = useState<'seo' | 'contacts' | 'prices'>('seo');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    const token = tokenStorage.getAccessToken();
    if (!token) router.push('/auth/login');
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current);
        doneTimeoutRef.current = null;
      }
    };
  }, []);

  const showToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSearch = async (keyword: string, searchProvider: string) => {
    if (!keyword.trim() || !city || !searchProvider) {
      setError('Заполните все параметры поиска');
      showToast('error', 'Заполните все параметры поиска');
      return;
    }
    if (activeModule !== 'seo') return;
    if (isLoading) return;

    setError(null);
    setProgress(0);
    setIsLoading(true);

    const startedAt = Date.now();

    try {
      const query = `${keyword.trim()} ${city}`.trim();
      const search = await createSearch({
        query,
        search_provider: searchProvider,
        num_results: NUM_RESULTS,
      });

      const tid = setInterval(() => {
        if (!mountedRef.current) return;
        const elapsed = Date.now() - startedAt;
        const p = Math.min(100, (elapsed / TOTAL_DURATION_MS) * 100);
        setProgress(p);

        if (p >= 100) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          const t = setTimeout(() => {
            doneTimeoutRef.current = null;
            if (!mountedRef.current) return;
            setIsLoading(false);
            router.push(`/runs/${search.id}`);
          }, DONE_DELAY_MS);
          doneTimeoutRef.current = t;
        }
      }, PROGRESS_TICK_MS);
      progressIntervalRef.current = tid;
    } catch (err: unknown) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsLoading(false);
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail
        || (err as { message?: string }).message
        || 'Ошибка при создании поиска';
      setError(msg);
      showToast('error', msg);
    }
  };

  const step = stepFromProgress(progress);
  const isComplete = progress >= 100;

  return (
    <div className="max-w-[1250px] mx-auto px-4 sm:px-6">
      <div className="space-y-4 sm:space-y-6">
        <SearchCard
          city={city}
          onCityChange={setCity}
          onSubmit={handleSearch}
          activeModule={activeModule}
          onModuleChange={setActiveModule}
          isLoading={isLoading}
        />

        {error && !isLoading && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            <LoadingProcessPanel
              progress={progress}
              title="Идёт поиск лидов…"
              subtitle="Собираем выдачу и делаем быстрый SEO-аудит"
            />
            <ActivityTable step={step} isComplete={isComplete} isActive />
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
