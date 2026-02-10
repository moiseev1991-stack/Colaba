'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchCard } from '@/components/SearchCard';
import { createSearch } from '@/src/services/api/search';
import { ToastContainer, type Toast } from '@/components/Toast';

const NUM_RESULTS = 100;

export default function SeoPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState('Москва');
  const [activeModule, setActiveModule] = useState<'seo' | 'contacts' | 'prices'>('seo');
  const [toasts, setToasts] = useState<Toast[]>([]);

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
    setIsLoading(true);

    try {
      const query = `${keyword.trim()} ${city}`.trim();
      const search = await createSearch({ query, search_provider: searchProvider, num_results: NUM_RESULTS });
      router.push(`/runs/${search.id}`);
    } catch (err: unknown) {
      setIsLoading(false);
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail
        || (err as { message?: string }).message || 'Ошибка при создании поиска';
      setError(msg);
      showToast('error', msg);
    }
  };

  return (
    <div className="mx-auto max-w-[1250px] px-6 py-8 overflow-x-hidden">
      <h1 className="text-[20px] font-semibold" style={{ color: 'hsl(var(--text))' }}>
        Поиск / SEO-аудит
      </h1>
      <div className="mt-6 space-y-4">
        <SearchCard
          city={city}
          onCityChange={setCity}
          onSubmit={handleSearch}
          activeModule={activeModule}
          onModuleChange={setActiveModule}
          isLoading={isLoading}
        />
        {error && !isLoading && (
          <div className="rounded-[8px] border border-red-500 bg-red-50 p-4 dark:border-red-400 dark:bg-red-950/50">
            <p className="text-[14px] text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
