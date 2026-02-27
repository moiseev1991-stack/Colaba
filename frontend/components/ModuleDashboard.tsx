'use client';

/**
 * Shared real-data dashboard component used by SEO, Leads and Tenders module pages.
 * Replaces the old hardcoded MOCK dashboards.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Calendar, ExternalLink } from 'lucide-react';
import { getDashboard, type DashboardResponse, type DashboardPeriod, type DashboardModule } from '@/src/services/api/dashboard';
import { cn } from '@/lib/utils';

const CHART_HEIGHT = 160;

type Period = DashboardPeriod;

interface Props {
  module: Exclude<DashboardModule, 'all'>;
  title: string;
  runBaseUrl?: string; // base URL to open a run, default /runs
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4">
      <div className="text-[12px] font-medium text-gray-600 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-[20px] font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 h-[72px] animate-pulse" />;
}

export function ModuleDashboard({ module, title, runBaseUrl = '/runs' }: Props) {
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDashboard({ period, module });
      setData(res);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [period, module]);

  useEffect(() => { load(); }, [load]);

  const kpi = data?.kpi;
  const recentRuns = data?.recent_runs ?? [];
  const chartPoints = data?.runs_by_day ?? [];
  const maxTotal = Math.max(...chartPoints.map(d => d.total), 1);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-[24px] font-semibold text-gray-900 dark:text-white">{title}</h1>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-[6px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-[14px]"
          >
            <option value="day">День</option>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-[8px] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-8">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiCard label="Запросы" value={kpi?.total ?? 0} />
            <KpiCard label="Успешные" value={kpi?.success ?? 0} />
            <KpiCard label="Ошибки" value={kpi?.errors ?? 0} />
            <KpiCard label="Ср. время" value={formatDuration(kpi?.avg_time_sec ?? null)} />
            <KpiCard label="Результаты" value={kpi?.results ?? 0} />
            <KpiCard
              label="Успешность"
              value={kpi && kpi.total > 0 ? `${Math.round((kpi.success / kpi.total) * 100)}%` : '—'}
            />
          </>
        )}
      </div>

      {/* Chart */}
      <div className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-5 mb-8">
        <h3 className="text-[14px] font-medium text-gray-700 dark:text-gray-300 mb-4">Запросы по дням</h3>
        {loading ? (
          <div className="h-[160px] bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : chartPoints.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">Нет данных за период</div>
        ) : (
          <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT }}>
            {chartPoints.map((d) => {
              const h = maxTotal > 0 ? ((d.total / maxTotal) * (CHART_HEIGHT - 24)) : 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.date}: ${d.total} запр.`}>
                  <div className="w-full flex flex-col justify-end" style={{ height: CHART_HEIGHT - 24 }}>
                    <div
                      className="w-full rounded-t-[4px] min-h-[4px] transition-all"
                      style={{ height: `${Math.max(h, 4)}px`, backgroundColor: 'hsl(var(--chart-bar, 220 90% 56%))' }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-full">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent runs */}
      <section>
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Последние запуски</h2>
        <div className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-8 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />)}
            </div>
          ) : recentRuns.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Запусков пока нет
            </div>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Дата</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Запрос</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Статус</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Результаты</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="py-3 px-4 truncate max-w-[200px] text-gray-900 dark:text-white" title={r.query}>{r.query}</td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        'px-2 py-0.5 rounded text-xs',
                        r.status === 'completed' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                        r.status === 'failed' && 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
                        (r.status === 'processing' || r.status === 'pending') && 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
                      )}>
                        {r.status === 'completed' ? 'OK' : r.status === 'failed' ? 'Ошибка' : 'В работе'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-900 dark:text-white">{r.results}</td>
                    <td className="py-3 px-4">
                      <Link
                        href={`${runBaseUrl}/${r.id}`}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Открыть <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
