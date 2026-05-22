'use client';

/**
 * /app/leads — раздел «Лиды». Содержит две вкладки:
 *  - «По сайтам»  — существующий flow, вынесен как есть в _components/LegacyLeadsPanel.tsx
 *  - «По картам»  — новый flow модуля maps (шаги 13-16 ТЗ maps_parser_tz_full.md)
 *
 * Tabs без shadcn — простые кнопки на Tailwind (shadcn в проекте не установлен).
 */

import { useState } from 'react';

import LegacyLeadsPanel from './_components/LegacyLeadsPanel';
import { MapsSearchPanel } from '@/components/maps/MapsSearchPanel';
import { cn } from '@/lib/utils';

type Tab = 'sites' | 'maps';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sites', label: 'По сайтам' },
  { id: 'maps', label: 'По картам' },
];

export default function LeadsPage() {
  const [tab, setTab] = useState<Tab>('sites');

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
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
      </div>

      {tab === 'sites' && <LegacyLeadsPanel />}
      {tab === 'maps' && <MapsSearchPanel />}
    </div>
  );
}
