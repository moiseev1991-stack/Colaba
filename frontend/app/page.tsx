'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SearchCard } from '@/components/SearchCard';
import { tokenStorage } from '@/client';
import { Loader2 } from 'lucide-react';
import { ToastContainer, type Toast } from '@/components/Toast';

export default function HomePage() {
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Redirect to login if not authenticated
    const token = tokenStorage.getAccessToken();
    if (!token) {
      router.push('/auth/login');
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [router]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [activeModule, setActiveModule] = useState<'seo' | 'contacts' | 'prices'>('seo');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (type: Toast['type'], message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleSearch = (keyword: string, searchProvider: string) => {
    // Validation
    if (!keyword.trim() || !city || !searchProvider) {
      setError('Заполните все параметры поиска');
      showToast('error', 'Заполните все параметры поиска');
      return;
    }
    
    // Don't allow search for disabled modules
    if (activeModule !== 'seo') return;
    
    // Don't start if already loading
    if (isLoading) return;
    
    // Clear previous timeout if exists
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    setIsLoading(true);
    setError(null);
    
    // Demo: simulate search process (exactly 10 seconds)
    const searchDuration = 10000; // 10000ms = 10 seconds
    
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      
      // Redirect to demo results page
      router.push('/runs/demo?demo=true');
    }, searchDuration);
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
          isLoading={isLoading}
        />
        
        {/* Loading State - Skeleton Results */}
        {isLoading && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-red-600 dark:text-red-500" />
              Идёт поиск…
            </h2>
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1 max-w-xs"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                    <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Error State - Only show when not loading */}
        {error && !isLoading && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
          </div>
        )}
      </div>
      
      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
