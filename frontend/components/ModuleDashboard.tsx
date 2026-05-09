'use client';

/**
 * Shared real-data dashboard component used by SEO, Leads and Tenders module pages.
 * Replaces the old hardcoded MOCK dashboards.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Calendar, Eye } from 'lucide-react';
import { getDashboard, type DashboardResponse, type DashboardPeriod, type DashboardModule } from '@/src/services/api/dashboard';

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
    <div
      className="rounded-[8px] border p-4"
      style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="text-[12px] font-medium" style={{ color: 'hsl(var(--muted))' }}>{label}</div>
      <div className="mt-1 text-[20px] font-semibold" style={{ color: 'hsl(var(--text))' }}>{value}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-[8px] border h-[72px] app-skeleton"
      style={{ borderColor: 'hsl(var(--border))' }}
    />
  );
}

function statusBadgeClass(s: string): string {
  if (s === 'completed') return 'app-badge app-badge-success';
  if (s === 'failed') return 'app-badge app-badge-danger';
  if (s === 'processing' || s === 'running' || s === 'pending') return 'app-badge app-badge-warning';
  return 'app-badge app-badge-accent';
}

function statusLabel(s: string): string {
  if (s === 'completed') return 'OK';
  if (s === 'failed') return 'Ошибка';
  if (s === 'processing' || s === 'running' || s === 'pending') return 'В работе';
  return s;
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
        <h1 className="text-[24px] font-semibold" style={{ color: 'hsl(var(--text))' }}>{title}</h1>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" style={{ color: 'hsl(var(--muted))' }} />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-[6px] border px-3 py-2 text-[14px]"
            style={{
              background: 'hsl(var(--surface))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--text))',
            }}
          >
            <option value="day">День</option>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
          </select>
        </div>
      </div>

      {error && (
        <div
          className="mb-6 rounded-[8px] border px-4 py-3 text-sm"
          style={{
            background: 'hsl(var(--danger) / 0.1)',
            borderColor: 'hsl(var(--danger) / 0.3)',
            color: 'hsl(var(--danger))',
          }}
        >
          {error}
        </div>
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
      <div
        className="rounded-[8px] border p-5 mb-8"
        style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
      >
        <h3 className="text-[14px] font-medium mb-4" style={{ color: 'hsl(var(--muted))' }}>Запросы по дням</h3>
        {loading ? (
          <div className="h-[160px] rounded app-skeleton" />
        ) : chartPoints.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
            Нет данных за период
          </div>
        ) : (
          <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT }}>
            {chartPoints.map((d) => {
              const h = maxTotal > 0 ? ((d.total / maxTotal) * (CHART_HEIGHT - 24)) : 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.date}: ${d.total} запр.`}>
                  <div className="w-full flex flex-col justify-end" style={{ height: CHART_HEIGHT - 24 }}>
                    <div
                      className="w-full rounded-t-[4px] min-h-[4px] transition-all"
                      style={{ height: `${Math.max(h, 4)}px`, backgroundColor: 'hsl(var(--accent))' }}
                    />
                  </div>
                  <span className="text-[10px] truncate max-w-full" style={{ color: 'hsl(var(--muted))' }}>{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent runs — card style matching /app/leads */}
      <section>
        <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'hsl(var(--text))' }}>Последние запуски</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[64px] app-skeleton" style={{ borderRadius: 4 }} />
            ))}
          </div>
        ) : recentRuns.length === 0 ? (
          <div
            className="py-10 text-center text-sm rounded-[8px] border"
            style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted))' }}
          >
            Запусков пока нет
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentRuns.map((r, idx) => (
              <Link
                key={r.id}
                href={`${runBaseUrl}/${r.id}`}
                className="app-run-card w-full text-left"
              >
                <span className="app-mono-label shrink-0 w-10 text-center" style={{ color: 'hsl(var(--muted))' }}>
                  #{String(idx + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate" style={{ color: 'hsl(var(--text))' }} title={r.query}>
                    {r.query}
                  </div>
                  <div className="app-mono-label mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
                    {formatDateTime(r.created_at)} · {r.results} {r.results === 1 ? 'лид' : 'лидов'}
                  </div>
                </div>
                <span className={statusBadgeClass(r.status)}>{statusLabel(r.status)}</span>
                <div className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'hsl(var(--accent))' }}>
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Открыть</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
