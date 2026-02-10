'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, Users, BarChart3, Calendar } from 'lucide-react';
import { listSearches } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';

const CHART_HEIGHT = 180;

type Period = 'day' | 'week' | 'month' | 'custom';

const MODULE_ROUTES: Record<string, string> = {
  seo: '/runs',
  leads: '/app/leads/history',
  tenders: '/app/gos/history',
};

function filterByPeriod(items: SearchResponse[], period: Period): SearchResponse[] {
  const now = Date.now();
  let from = 0;
  if (period === 'day') from = now - 24 * 60 * 60 * 1000;
  else if (period === 'week') from = now - 7 * 24 * 60 * 60 * 1000;
  else if (period === 'month') from = now - 30 * 24 * 60 * 60 * 1000;
  else return items;
  return items.filter((s) => new Date(s.created_at).getTime() >= from);
}

type DayPoint = { date: string; dateShort: string; total: number; success: number; error: number; running: number };

function aggregateByDay(items: SearchResponse[], period: Period): DayPoint[] {
  const map = new Map<string, { total: number; success: number; error: number; running: number }>();
  items.forEach((s) => {
    const d = new Date(s.created_at).toISOString().slice(0, 10);
    const cur = map.get(d) ?? { total: 0, success: 0, error: 0, running: 0 };
    cur.total++;
    if (s.status === 'completed') cur.success++;
    else if (s.status === 'failed') cur.error++;
    else cur.running++;
    map.set(d, cur);
  });
  const now = new Date();
  let daysBack = 7;
  if (period === 'day') daysBack = 1;
  else if (period === 'week') daysBack = 7;
  else if (period === 'month') daysBack = 30;
  else daysBack = 30;
  const result: DayPoint[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const v = map.get(key) ?? { total: 0, success: 0, error: 0, running: 0 };
    result.push({
      date: key,
      dateShort: key.slice(5),
      total: v.total,
      success: v.success,
      error: v.error,
      running: v.running,
    });
  }
  return result;
}

function ChartBar({ data, max, onHover, hovered }: { data: DayPoint; max: number; onHover: (v: DayPoint | null) => void; hovered: boolean }) {
  const h = max > 0 ? (data.total / max) * (CHART_HEIGHT - 32) : 0;
  return (
    <div
      className="flex-1 flex flex-col items-center gap-1 min-w-0"
      onMouseEnter={() => onHover(data)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="relative w-full flex-1 flex flex-col justify-end">
        {hovered && (
          <div
            className="absolute -top-10 left-1/2 -translate-x-1/2 z-10 px-2 py-1.5 rounded text-xs whitespace-nowrap shadow-lg border"
            style={{
              backgroundColor: 'hsl(var(--chart-tooltip-bg))',
              color: 'hsl(var(--chart-tooltip-text))',
              borderColor: 'hsl(var(--chart-tooltip-border))',
            }}
          >
            {data.date}<br />
            Всего: {data.total} · Успешных: {data.success} · Ошибок: {data.error}
          </div>
        )}
        <div
          className="w-full rounded-t-[4px] transition-all min-h-[4px]"
          style={{
            height: `${Math.max(h, 4)}px`,
            backgroundColor: 'hsl(var(--chart-bar))',
            opacity: hovered ? 1 : 0.9,
          }}
        />
      </div>
      <span className="text-[11px] font-medium truncate max-w-full" style={{ color: 'hsl(var(--chart-axis))' }}>{data.dateShort}</span>
    </div>
  );
}

function StackedBar({ data, max, onHover, hovered }: { data: DayPoint; max: number; onHover: (v: DayPoint | null) => void; hovered: boolean }) {
  const total = data.success + data.error + data.running;
  const scale = max > 0 ? (CHART_HEIGHT - 32) / max : 0;
  const hSuccess = Math.max(data.success * scale, 0);
  const hError = Math.max(data.error * scale, 0);
  const hRunning = Math.max(data.running * scale, 0);
  const hasAny = hSuccess > 0 || hError > 0 || hRunning > 0;
  return (
    <div
      className="flex-1 flex flex-col items-center gap-1 min-w-0"
      onMouseEnter={() => onHover(data)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="relative w-full flex-1 flex flex-col justify-end min-h-[4px]">
        {hovered && (
          <div
            className="absolute -top-10 left-1/2 -translate-x-1/2 z-10 px-2 py-1.5 rounded text-xs whitespace-nowrap shadow-lg border"
            style={{
              backgroundColor: 'hsl(var(--chart-tooltip-bg))',
              color: 'hsl(var(--chart-tooltip-text))',
              borderColor: 'hsl(var(--chart-tooltip-border))',
            }}
          >
            {data.date}<br />
            Успешных: {data.success} · Ошибок: {data.error}{data.running > 0 ? ` · В работе: ${data.running}` : ''}
          </div>
        )}
        <div className="w-full flex flex-col-reverse rounded-t-[4px] overflow-hidden" style={{ minHeight: hasAny ? 4 : 0 }}>
          {hSuccess > 0 && <div className="w-full" style={{ height: hSuccess, minHeight: 2, backgroundColor: 'hsl(var(--chart-success))' }} />}
          {hError > 0 && <div className="w-full" style={{ height: hError, minHeight: 2, backgroundColor: 'hsl(var(--chart-error))' }} />}
          {hRunning > 0 && <div className="w-full" style={{ height: hRunning, minHeight: 2, backgroundColor: 'hsl(var(--chart-running))' }} />}
        </div>
      </div>
      <span className="text-[11px] font-medium truncate max-w-full" style={{ color: 'hsl(var(--chart-axis))' }}>{data.dateShort}</span>
    </div>
  );
}

function KpiCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4">
      <div className="text-[12px] font-medium text-gray-600 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-[20px] font-semibold text-gray-900 dark:text-white">
        {value}
        {suffix && <span className="text-[14px] font-normal ml-1 text-gray-500 dark:text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}

export default function MainDashboardPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [searches, setSearches] = useState<SearchResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<DayPoint | null>(null);
  const [hoveredStacked, setHoveredStacked] = useState<DayPoint | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await listSearches();
        if (!cancelled) setSearches(data);
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
          || (e as { message?: string })?.message || 'Ошибка загрузки';
        if (!cancelled) setLoadError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => filterByPeriod(searches, period), [searches, period]);
  const chartData = useMemo(() => aggregateByDay(filtered, period), [filtered, period]);

  const kpi = useMemo(() => {
    const ok = filtered.filter((s) => s.status === 'completed').length;
    const err = filtered.filter((s) => s.status === 'failed').length;
    const domains = filtered.reduce((a, s) => a + (s.result_count || 0), 0);
    const cost = filtered.length * 0.2;
    return {
      requests: filtered.length,
      success: ok,
      errors: err,
      avgTime: '—',
      cost: cost.toFixed(2) + ' ₽',
      leads: '-',
      domains,
    };
  }, [filtered]);

  const moduleStats = useMemo(() => ({
    seo: { requests: filtered.length, ok: filtered.filter((s) => s.status === 'completed').length, errors: filtered.filter((s) => s.status === 'failed').length },
    leads: { requests: 0, ok: 0, errors: 0 },
    tenders: { requests: 0, ok: 0, errors: 0 },
  }), [filtered]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-[24px] font-semibold text-gray-900 dark:text-white">Дашборд</h1>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-[6px] border border-gray-300 dark:border-gray-600 px-3 py-2 text-[14px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="day">День</option>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
            <option value="custom">Свой период</option>
          </select>
        </div>
      </div>

      {loadError && (
        <div className="mb-6 rounded-[8px] border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4">
          <p className="text-red-700 dark:text-red-300">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
          >
            Обновить
          </button>
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Общий обзор</h2>
        {loading ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 h-[72px] animate-pulse bg-gray-100 dark:bg-gray-700" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Всего запросов" value={kpi.requests} />
            <KpiCard label="Успешные" value={kpi.success} />
            <KpiCard label="Ошибки" value={kpi.errors} />
            <KpiCard label="Ср. время" value={kpi.avgTime} suffix="" />
            <KpiCard label="Стоимость" value={kpi.cost} suffix="" />
            <KpiCard label="Лидов / Домены" value={`${kpi.leads} / ${kpi.domains}`} suffix="" />
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Запросы по дням</h2>
        <div
          className="rounded-[8px] border p-6 relative overflow-hidden"
          style={{
            borderColor: 'hsl(var(--border))',
            backgroundColor: 'hsl(var(--surface))',
            height: CHART_HEIGHT + 80,
          }}
        >
          <div
            className="absolute inset-6 opacity-30 pointer-events-none"
            style={{
              backgroundImage: `repeating-linear-gradient(to right, hsl(var(--chart-grid)) 0 1px, transparent 1px calc(100% / 5)), repeating-linear-gradient(to top, hsl(var(--chart-grid)) 0 1px, transparent 1px 20px)`,
            }}
          />
          {loading ? (
            <div className="absolute inset-6 flex items-center justify-center">
              <div className="w-full h-full animate-pulse rounded" style={{ backgroundColor: 'hsl(var(--chart-grid) / 0.3)' }} />
            </div>
          ) : chartData.length === 0 ? (
            <div className="absolute inset-6 flex items-center justify-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
              Нет запусков за период
            </div>
          ) : (
            <div className="absolute inset-6 bottom-10 flex items-end gap-1">
              {chartData.map((d) => (
                <ChartBar key={d.date} data={d} max={Math.max(...chartData.map((x) => x.total), 1)} onHover={setHoveredBar} hovered={hoveredBar?.date === d.date} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Ошибки / Успешные по дням</h2>
        <div className="flex items-center gap-4 mb-2">
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--chart-axis))' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-success))' }} />
            Успешные
          </span>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--chart-axis))' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-error))' }} />
            Ошибки
          </span>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--chart-axis))' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-running))' }} />
            В работе
          </span>
        </div>
        <div
          className="rounded-[8px] border p-6 relative overflow-hidden"
          style={{
            borderColor: 'hsl(var(--border))',
            backgroundColor: 'hsl(var(--surface))',
            height: CHART_HEIGHT + 80,
          }}
        >
          <div
            className="absolute inset-6 opacity-30 pointer-events-none"
            style={{
              backgroundImage: `repeating-linear-gradient(to right, hsl(var(--chart-grid)) 0 1px, transparent 1px calc(100% / 5)), repeating-linear-gradient(to top, hsl(var(--chart-grid)) 0 1px, transparent 1px 20px)`,
            }}
          />
          {loading ? (
            <div className="absolute inset-6 flex items-center justify-center">
              <div className="w-full h-full animate-pulse rounded" style={{ backgroundColor: 'hsl(var(--chart-grid) / 0.3)' }} />
            </div>
          ) : chartData.length === 0 ? (
            <div className="absolute inset-6 flex items-center justify-center text-sm" style={{ color: 'hsl(var(--muted))' }}>
              Нет запусков за период
            </div>
          ) : (
            <div className="absolute inset-6 bottom-10 flex items-end gap-1">
              {chartData.map((d) => (
                <StackedBar
                  key={d.date}
                  data={d}
                  max={Math.max(...chartData.map((x) => x.success + x.error + x.running), 1)}
                  onHover={setHoveredStacked}
                  hovered={hoveredStacked?.date === d.date}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Модули</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { id: 'seo', title: 'SEO', desc: 'Аудит, проверки, история запросов', icon: Search, stats: moduleStats.seo },
            { id: 'leads', title: 'Поиск лидов', desc: 'Поиск, контакты, экспорт', icon: Users, stats: moduleStats.leads },
            { id: 'tenders', title: 'Госзакупки', desc: 'Мониторинг, история, фильтры', icon: BarChart3, stats: moduleStats.tenders },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.id}
                href={MODULE_ROUTES[m.id] || '#'}
                className="group rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6 transition-colors hover:border-blue-400 block"
              >
                <Icon className="mb-3 h-8 w-8 text-blue-600 dark:text-blue-400" />
                <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white">{m.title}</h3>
                <p className="mt-1 text-[14px] text-gray-600 dark:text-gray-400">{m.desc}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: 'hsl(var(--text))' }}>
                    {m.stats.requests} запросов · {m.stats.ok} OK · {m.stats.errors} ошибок
                  </span>
                  <span className="text-[14px] font-semibold" style={{ color: 'hsl(var(--accent))' }}>Открыть →</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
