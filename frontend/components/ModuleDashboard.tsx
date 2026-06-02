'use client';

/**
 * Shared real-data dashboard component used by SEO, Leads and Tenders module pages.
 * Replaces the old hardcoded MOCK dashboards.
 *
 * §4.2 ТЗ редизайна 2026-06-03 — переписано на новый язык:
 *   - MetricCard вместо KpiCard (display-шрифт, иконка, единый стиль)
 *   - max-w-7xl (1280px) чтоб убрать пустоту по бокам
 *   - CardV2 для chart-блока и recent-runs (hover-lift)
 *   - bg-brand-gradient на столбцах графика
 *   - Skeleton v2 (shimmer) вместо app-skeleton
 *   - reveal-stack для staggered появления карточек
 *   - title в font-display
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, Calendar, CheckCircle2, Clock, Eye, Percent, Target } from 'lucide-react';
import { getDashboard, type DashboardResponse, type DashboardPeriod, type DashboardModule } from '@/src/services/api/dashboard';

import { MetricCard } from '@/components/ui/MetricCard';
import { CardV2 } from '@/components/ui/CardV2';
import { Skeleton } from '@/components/ui/Skeleton';
import { SignalPill } from '@/components/ui/SignalPill';

const CHART_HEIGHT = 200;

type Period = DashboardPeriod;

interface Props {
  module: Exclude<DashboardModule, 'all'>;
  title: string;
  runBaseUrl?: string;
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

function statusTone(s: string): 'good' | 'hot' | 'warm' | 'muted' {
  if (s === 'completed') return 'good';
  if (s === 'failed') return 'hot';
  if (s === 'processing' || s === 'running' || s === 'pending') return 'warm';
  return 'muted';
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

  // Успешность с учётом goodDirection — для метрики «ошибки» рост = плохо.
  const successRate = kpi && kpi.total > 0 ? Math.round((kpi.success / kpi.total) * 100) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display font-semibold tracking-tight"
            style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', color: 'hsl(var(--text))' }}>
          {title}
        </h1>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[hsl(var(--muted))]" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-v2-sm border px-3 py-2 text-[13px]"
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
          className="mb-6 rounded-v2-sm border px-4 py-3 text-sm"
          style={{
            background: 'hsl(var(--danger) / 0.1)',
            borderColor: 'hsl(var(--danger) / 0.3)',
            color: 'hsl(var(--danger))',
          }}
        >
          {error}
        </div>
      )}

      {/* KPI Cards — адаптивный грид 2 / 3 / 6 (см. §4.2 ТЗ) */}
      <div className="reveal-stack mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[112px]" rounded="lg" />
          ))
        ) : (
          <>
            <div className="reveal-item"><MetricCard label="Запросы"    value={kpi?.total ?? 0}                          icon={<Activity />} /></div>
            <div className="reveal-item"><MetricCard label="Успешные"   value={kpi?.success ?? 0}                        icon={<CheckCircle2 />} /></div>
            <div className="reveal-item"><MetricCard label="Ошибки"     value={kpi?.errors ?? 0}                         icon={<AlertTriangle />} goodDirection="down" /></div>
            <div className="reveal-item"><MetricCard label="Ср. время"  value={formatDuration(kpi?.avg_time_sec ?? null)} icon={<Clock />} /></div>
            <div className="reveal-item"><MetricCard label="Результаты" value={kpi?.results ?? 0}                        icon={<Target />} /></div>
            <div className="reveal-item"><MetricCard label="Успешность" value={successRate != null ? `${successRate}%` : '—'} icon={<Percent />} /></div>
          </>
        )}
      </div>

      {/* Chart — широкая, выше, brand-gradient столбцы */}
      <CardV2 className="mb-8 p-5 reveal-item">
        <h3 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
          Запросы по дням
        </h3>
        {loading ? (
          <Skeleton className="h-[200px]" rounded="md" />
        ) : chartPoints.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-[hsl(var(--muted))]">
            Нет данных за период
          </div>
        ) : (
          <div className="flex items-end gap-1.5" style={{ height: CHART_HEIGHT }}>
            {chartPoints.map((d) => {
              const h = maxTotal > 0 ? ((d.total / maxTotal) * (CHART_HEIGHT - 28)) : 0;
              return (
                <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${d.date}: ${d.total} запр.`}>
                  <div className="flex w-full flex-col justify-end" style={{ height: CHART_HEIGHT - 28 }}>
                    <div
                      className="w-full rounded-t-v2-sm bg-brand-gradient transition-all duration-300 hover:opacity-90"
                      style={{ height: `${Math.max(h, 4)}px`, minHeight: 4 }}
                    />
                  </div>
                  <span className="max-w-full truncate text-[10px] text-[hsl(var(--muted))]">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardV2>

      {/* Recent runs — карточки на всю ширину (§4.2 + §4.3) */}
      <section>
        <h2 className="mb-4 font-display text-[18px] font-semibold tracking-tight text-[hsl(var(--text))]">
          Последние запуски
        </h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-[68px]" rounded="lg" />)}
          </div>
        ) : recentRuns.length === 0 ? (
          <CardV2 className="px-6 py-10 text-center text-sm text-[hsl(var(--muted))]">
            Запусков пока нет
          </CardV2>
        ) : (
          <ul className="reveal-stack space-y-2">
            {recentRuns.map((r, idx) => (
              <li key={r.id}>
                <Link
                  href={`${runBaseUrl}/${r.id}`}
                  className="block"
                >
                  <CardV2 interactive reveal className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
                    <span className="hidden w-10 shrink-0 text-center text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))] sm:inline">
                      #{String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] font-semibold text-[hsl(var(--text))]" title={r.query}>
                        {r.query}
                      </div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                        {formatDateTime(r.created_at)} · {r.results} {r.results === 1 ? 'лид' : 'лидов'}
                      </div>
                    </div>
                    <SignalPill tone={statusTone(r.status)} size="sm">{statusLabel(r.status)}</SignalPill>
                    <span className="hidden items-center gap-1 text-[13px] font-medium text-brand-600 dark:text-brand-400 sm:inline-flex">
                      <Eye className="h-4 w-4" /> Открыть
                    </span>
                  </CardV2>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
