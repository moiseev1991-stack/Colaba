'use client';

/**
 * /app/leads — раздел «Лиды». Содержит две вкладки:
 *  - «По сайтам»  — существующий flow, вынесен как есть в _components/LegacyLeadsPanel.tsx
 *  - «По картам»  — новый flow модуля maps (шаги 13-16 ТЗ maps_parser_tz_full.md)
 *
 * Tabs без shadcn — простые кнопки на Tailwind (shadcn в проекте не установлен).
 */

import { Bookmark, ListPlus } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

import LegacyLeadsPanel from './_components/LegacyLeadsPanel';
import { MapsSearchPanel } from '@/components/maps/MapsSearchPanel';
import { cn } from '@/lib/utils';

type Tab = 'sites' | 'maps';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'maps', label: 'По картам' },
  { id: 'sites', label: 'По сайтам' },
];

export default function LeadsPage() {
  const [tab, setTab] = useState<Tab>('maps');

  return (
    <div className="space-y-4">
      {/* px-3 на мобиле — было px-6 (48px по бокам) и шапка вкладок
          с двумя кнопками справа не влезала на 390px (ТЗ B.0 #4). */}
      <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-6 pt-4 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
          <nav className="-mb-px flex gap-2 sm:gap-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="mb-1 flex flex-wrap gap-2">
            <Link
              href="/app/leads/presets"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Bookmark className="h-4 w-4" />
              Мои пресеты
            </Link>
            <Link
              href="/app/leads/lists"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ListPlus className="h-4 w-4" />
              Мои списки
            </Link>
          </div>
        </div>
      </div>

      {tab === 'sites' && <LegacyLeadsPanel />}
      {tab === 'maps' && (
        <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-6 pb-10">
          {/* Suspense нужен потому что MapsSearchPanel читает useSearchParams
              (?map_search_id=N); без него Next.js падает на prerender. */}
          <Suspense fallback={null}>
            <MapsSearchPanel />
          </Suspense>
        </div>
      )}
    </div>
  );
}
