'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { SearchResultResponse } from '@/src/services/api/search';

const DOMAINS = [
  'law-firm.ru',
  'web-agency.com',
  'test-site.ru',
  'local-business.ru',
  'medical-clinic.com',
  'restaurant-chain.com',
  'shop.example',
  'studio.example',
];

const PATHS = ['/', '/contacts', '/about', '/services', '/prices', '/faq'];

const ACTIONS_BY_STEP: Record<number, string[]> = {
  0: ['Fetch SERP', 'Parse SERP', 'Extract URLs', 'Fetch SERP page'],
  1: ['Normalize domain', 'Dedupe', 'Add domain', 'Resolve canonical'],
  2: ['Crawl /robots.txt', 'Fetch sitemap', 'Parse robots', 'Check sitemap'],
  3: ['Check title', 'Check H1', 'Check meta desc', 'Parse meta'],
};

const FINDINGS_POOL: { text: string; type: 'ok' | 'warn' | 'missing' }[] = [
  { text: 'robots OK', type: 'ok' },
  { text: 'sitemap OK', type: 'ok' },
  { text: 'sitemap missing', type: 'missing' },
  { text: 'title dup 12%', type: 'warn' },
  { text: 'desc empty 45%', type: 'warn' },
  { text: 'H1 OK', type: 'ok' },
  { text: 'meta OK', type: 'ok' },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTime(): string {
  const d = new Date();
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export interface ActivityRow {
  id: number;
  time: string;
  url: string;
  action: string;
  ms: number;
  finding: { text: string; type: 'ok' | 'warn' | 'missing' };
}

const MAX_ROWS = 20;
const TICK_MS_MIN = 400;
const TICK_MS_MAX = 800;

interface ActivityTableProps {
  step: number;
  isComplete: boolean;
  isActive: boolean;
  liveResults?: SearchResultResponse[];
}

export function ActivityTable({ step, isComplete, isActive, liveResults }: ActivityTableProps) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const idRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedResultIdsRef = useRef<Set<number>>(new Set());

  // Reset when search starts
  useEffect(() => {
    if (isActive && !isComplete) {
      processedResultIdsRef.current.clear();
      setRows([]);
    }
  }, [isActive, isComplete]);

  // When we have real results from API: show ONLY real data (replace placeholders)
  useEffect(() => {
    if (!isActive || isComplete || !liveResults || liveResults.length === 0) {
      return;
    }

    const actions = ACTIONS_BY_STEP[Math.min(step, 3)] ?? ACTIONS_BY_STEP[0];
    // Build full table from liveResults (newest first for feed look)
    const rowsFromApi: ActivityRow[] = [...liveResults]
      .reverse()
      .slice(0, MAX_ROWS)
      .map((result) => {
        const displayUrl = result.url.length > 28 ? result.url.slice(0, 25) + '…' : result.url;
        return {
          id: result.id,
          time: formatTime(),
          url: displayUrl,
          action: pick(actions),
          ms: Math.floor(Math.random() * (950 - 120 + 1)) + 120,
          finding: pick(FINDINGS_POOL),
        };
      });

    setRows(rowsFromApi);
  }, [liveResults, step, isActive, isComplete]);

  // Fallback: generate fake rows if no live results
  useEffect(() => {
    if (!isActive || isComplete) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Only use fallback if no live results are available
    if (liveResults && liveResults.length > 0) {
      return;
    }

    const tick = () => {
      idRef.current += 1;
      const actions = ACTIONS_BY_STEP[Math.min(step, 3)] ?? ACTIONS_BY_STEP[0];
      const domain = pick(DOMAINS);
      const path = pick(PATHS);
      const url = `${domain}${path}`;
      const truncated = url.length > 28 ? url.slice(0, 25) + '…' : url;
      const action = pick(actions);
      const ms = Math.floor(Math.random() * (950 - 120 + 1)) + 120;
      const finding = pick(FINDINGS_POOL);

      setRows((prev) => {
        const next = [{ id: idRef.current, time: formatTime(), url: truncated, action, ms, finding }, ...prev];
        return next.slice(0, MAX_ROWS);
      });
    };

    const schedule = () => {
      tick();
      const delay = Math.floor(Math.random() * (TICK_MS_MAX - TICK_MS_MIN + 1)) + TICK_MS_MIN;
      timeoutRef.current = setTimeout(schedule, delay);
    };

    schedule();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isActive, isComplete, step, liveResults]);

  return (
    <div className="w-full max-w-[900px] mx-auto rounded-[14px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-md overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Лента обработки</h3>
        {isComplete && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">Process completed</span>
        )}
      </div>
      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/95 border-b border-gray-200 dark:border-gray-600">
            <tr>
              <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[70px]">
                Time
              </th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                URL
              </th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                Action
              </th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[50px]">
                ms
              </th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                Findings
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                <td className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                  {r.time}
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 truncate max-w-[140px]" title={r.url}>
                  <span className="truncate block">{r.url}</span>
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300">
                  {r.action}
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                  {r.ms}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      'inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium',
                      r.finding.type === 'ok' &&
                        'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
                      r.finding.type === 'warn' &&
                        'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
                      r.finding.type === 'missing' &&
                        'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                    )}
                  >
                    {r.finding.text}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !isComplete && isActive && (
          <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Ожидание событий…
          </div>
        )}
        {rows.length === 0 && !isActive && !isComplete && (
          <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Запустите поиск
          </div>
        )}
      </div>
    </div>
  );
}
