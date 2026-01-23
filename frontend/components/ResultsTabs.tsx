'use client';

import { cn } from '@/lib/utils';

interface ResultsTabsProps {
  activeTab: 'seo' | 'contacts' | 'prices';
  onTabChange?: (tab: 'seo' | 'contacts' | 'prices') => void;
}

export function ResultsTabs({ activeTab = 'seo', onTabChange }: ResultsTabsProps) {
  return (
    <div className="flex gap-4 mb-6 border-b border-gray-300 dark:border-gray-700">
      <button
        className={cn(
          'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
          activeTab === 'seo'
            ? 'border-red-600 text-red-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        )}
        onClick={() => onTabChange?.('seo')}
      >
        SEO
      </button>
      <button
        className={cn(
          'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 opacity-50 cursor-not-allowed',
        )}
        disabled
      >
        Контакты
        <span className="ml-2 text-xs">Скоро</span>
      </button>
      <button
        className={cn(
          'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 opacity-50 cursor-not-allowed',
        )}
        disabled
      >
        Мониторинг цен
        <span className="ml-2 text-xs">Скоро</span>
      </button>
    </div>
  );
}
