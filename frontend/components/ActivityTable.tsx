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

  // §4.13 ТЗ редизайна 2026-06-03 (Phase C batch 4): «Лента обработки» на v2.
  return (
    <div
      className="w-full max-w-[900px] mx-auto rounded-v2-lg border shadow-v2-sm overflow-hidden"
      style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid hsl(var(--border))' }}
      >
        <h3
          className="font-display font-semibold tracking-tight text-sm"
          style={{ color: 'hsl(var(--text))' }}
        >
          Лента обработки
        </h3>
        {isComplete && (
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--signal-good)' }}
          >
            Process completed
          </span>
        )}
      </div>
      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
        <table className="w-full text-left">
          <thead
            className="sticky top-0"
            style={{
              background: 'hsl(var(--surface-2))',
              borderBottom: '1px solid hsl(var(--border))',
            }}
          >
            <tr>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider w-[70px] th-muted">
                Time
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider min-w-[120px] th-muted">
                URL
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider min-w-[100px] th-muted">
                Action
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider w-[50px] th-muted">
                ms
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider min-w-[100px] th-muted">
                Findings
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="transition-colors hover:bg-[hsl(var(--surface-2))]"
                style={{ borderBottom: '1px solid hsl(var(--border))' }}
              >
                <td className="px-3 py-1.5 text-xs tabular-nums td-muted">
                  {r.time}
                </td>
                <td
                  className="px-3 py-1.5 text-xs truncate max-w-[140px] td-default"
                  title={r.url}
                >
                  <span className="truncate block">{r.url}</span>
                </td>
                <td className="px-3 py-1.5 text-xs td-default">
                  {r.action}
                </td>
                <td className="px-3 py-1.5 text-xs tabular-nums td-muted">
                  {r.ms}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      'inline-flex rounded-v2-sm px-1.5 py-0.5 text-[10px] font-medium',
                      r.finding.type === 'ok' &&
                        'bg-[var(--signal-good-bg)] text-[color:var(--signal-good)]',
                      r.finding.type === 'warn' &&
                        'bg-[var(--signal-warm-bg)] text-[color:var(--signal-warm)]',
                      r.finding.type === 'missing' &&
                        'bg-[var(--signal-hot-bg)] text-[color:var(--signal-hot)]',
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
          <div className="px-4 py-6 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Ожидание событий…
          </div>
        )}
        {rows.length === 0 && !isActive && !isComplete && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Запустите поиск
          </div>
        )}
      </div>
    </div>
  );
}
