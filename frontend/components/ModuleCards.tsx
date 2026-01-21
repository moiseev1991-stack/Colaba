'use client';

import { cn } from '@/lib/utils';

interface ModuleCardsProps {
  activeModule?: 'seo' | 'contacts' | 'prices';
  onModuleClick?: (module: 'seo' | 'contacts' | 'prices') => void;
}

export function ModuleCards({ activeModule = 'seo', onModuleClick }: ModuleCardsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mb-8">
      {/* SEO Module */}
      <div
        className={cn(
          'h-32 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors',
          activeModule === 'seo'
            ? 'bg-red-600 text-white'
            : 'bg-gray-700 dark:bg-gray-800 text-gray-400 opacity-50'
        )}
        onClick={() => onModuleClick?.('seo')}
      >
        <span className="text-lg font-medium">SEO</span>
      </div>

      {/* Contacts Module */}
      <div
        className={cn(
          'h-32 rounded-lg flex flex-col items-center justify-center cursor-not-allowed transition-colors',
          'bg-gray-700 dark:bg-gray-800 text-gray-400 opacity-50'
        )}
      >
        <span className="text-lg font-medium">Контакты</span>
        <span className="text-xs mt-1">Скоро</span>
      </div>

      {/* Price Monitoring Module */}
      <div
        className={cn(
          'h-32 rounded-lg flex flex-col items-center justify-center cursor-not-allowed transition-colors',
          'bg-gray-700 dark:bg-gray-800 text-gray-400 opacity-50'
        )}
      >
        <span className="text-lg font-medium">Мониторинг цен</span>
        <span className="text-xs mt-1">Скоро</span>
      </div>
    </div>
  );
}
