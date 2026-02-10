'use client';

import { cn } from '@/lib/utils';

interface ModuleTabsProps {
  activeModule: 'seo' | 'contacts' | 'prices';
  onModuleChange?: (module: 'seo' | 'contacts' | 'prices') => void;
}

export function ModuleTabs({ activeModule = 'seo', onModuleChange }: ModuleTabsProps) {
  return (
    <div className="flex gap-2 mb-4">
      {/* SEO Tab */}
      <button
        className={cn(
          'px-4 py-2.5 text-sm font-medium rounded-[10px] transition-all',
          activeModule === 'seo'
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
        )}
        onClick={() => onModuleChange?.('seo')}
      >
        SEO
      </button>

      {/* Contacts Tab */}
      <button
        className={cn(
          'px-4 py-2.5 text-sm font-medium rounded-[10px] transition-all opacity-50 cursor-not-allowed',
          'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
        )}
        disabled
      >
        Контакты
        <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">Скоро</span>
      </button>

      {/* Price Monitoring Tab */}
      <button
        className={cn(
          'px-4 py-2.5 text-sm font-medium rounded-[10px] transition-all opacity-50 cursor-not-allowed',
          'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
        )}
        disabled
      >
        Мониторинг цен
        <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">Скоро</span>
      </button>
    </div>
  );
}
