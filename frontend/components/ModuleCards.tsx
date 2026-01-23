'use client';

import { cn } from '@/lib/utils';

interface ModuleCardsProps {
  activeModule?: 'seo' | 'contacts' | 'prices';
  onModuleClick?: (module: 'seo' | 'contacts' | 'prices') => void;
}

export function ModuleCards({ activeModule = 'seo', onModuleClick }: ModuleCardsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* SEO Module */}
      <div
        className={cn(
          'bg-white dark:bg-gray-800 rounded-xl border-2 p-6 cursor-pointer transition-all',
          activeModule === 'seo'
            ? 'border-red-500 dark:border-red-500 shadow-lg shadow-red-500/20 dark:shadow-red-500/30'
            : 'border-gray-200 dark:border-gray-700'
        )}
        onClick={() => onModuleClick?.('seo')}
      >
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">SEO</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Аудит сайтов по SEO-метрикам и поиск проблем
        </p>
      </div>

      {/* Contacts Module */}
      <div
        className={cn(
          'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 cursor-not-allowed opacity-50'
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Контакты</h3>
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs font-medium">
            Скоро
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Поиск контактных данных компаний
        </p>
      </div>

      {/* Price Monitoring Module */}
      <div
        className={cn(
          'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 cursor-not-allowed opacity-50'
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Мониторинг цен</h3>
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs font-medium">
            Скоро
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Отслеживание изменений цен на товары
        </p>
      </div>
    </div>
  );
}
