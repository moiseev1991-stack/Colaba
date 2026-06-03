'use client';

import { cn } from '@/lib/utils';

// §4.19 ТЗ редизайна 2026-06-03 (Phase C batch 9): ResultsTabs на v2-токены.

interface ResultsTabsProps {
  activeTab: 'seo' | 'contacts' | 'prices';
  onTabChange?: (tab: 'seo' | 'contacts' | 'prices') => void;
}

export function ResultsTabs({ activeTab = 'seo', onTabChange }: ResultsTabsProps) {
  return (
    <div
      className="flex gap-4 mb-6 border-b"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <button
        className={cn(
          'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
          activeTab === 'seo'
            ? 'border-brand-500 text-brand-700 dark:text-brand-400'
            : 'border-transparent td-muted hover:text-[hsl(var(--text))]',
        )}
        onClick={() => onTabChange?.('seo')}
      >
        SEO
      </button>
      <button
        className="px-4 py-2 text-sm font-medium border-b-2 border-transparent td-muted opacity-50 cursor-not-allowed"
        disabled
      >
        Контакты
        <span className="ml-2 text-xs">Скоро</span>
      </button>
      <button
        className="px-4 py-2 text-sm font-medium border-b-2 border-transparent td-muted opacity-50 cursor-not-allowed"
        disabled
      >
        Мониторинг цен
        <span className="ml-2 text-xs">Скоро</span>
      </button>
    </div>
  );
}
