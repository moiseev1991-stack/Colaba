'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Users, BarChart3, Calendar, ExternalLink, Loader2, Clock } from 'lucide-react';
import { getDashboard, type DashboardResponse, type DashboardPeriod, type DashboardModule } from '@/src/services/api/dashboard';

const CHART_HEIGHT = 180;

const MODULE_ROUTES: Record<string, string> = {
  seo: '/runs',
  leads: '/app/leads/history',
  tenders: '/app/gos/history',
};

function getRunUrl(module: string, id: string): string {
  if (module === 'seo') return `/runs/${id}`;
  if (module === 'leads') return `/app/leads/results/${id}`;
  if (module === 'tenders') return `/app/gos/results/${id}`;
  return `/runs/${id}`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function SkeletonCard() {
  return (
    <div className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 h-[72px] animate-pulse bg-gray-100 dark:bg-gray-700" />
  );
}

type DayPoint = { date: string; dateShort: string; total: number; success: number; error: number; running: number };

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

function DonutChart({ success, errors, running }: { success: number; errors: number; running: number }) {
  const total = success + errors + running;
  if (total === 0) return null;
  const deg = 360 / total;
  return (
    <div className="flex items-center gap-6">
      <div className="relative w-24 h-24 rounded-full" style={{
        background: `conic-gradient(
          hsl(var(--chart-success)) 0deg ${success * deg}deg,
          hsl(var(--chart-error)) ${success * deg}deg ${(success + errors) * deg}deg,
          hsl(var(--chart-running)) ${(success + errors) * deg}deg 360deg
        )`,
      }}>
        <div className="absolute inset-2 rounded-full bg-white dark:bg-gray-800" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold" style={{ color: 'hsl(var(--text))' }}>{total}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2" style={{ color: 'hsl(var(--chart-axis))' }}>
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-success))' }} /> Успешных: {success}
        </span>
        <span className="flex items-center gap-2" style={{ color: 'hsl(var(--chart-axis))' }}>
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-error))' }} /> Ошибок: {errors}
        </span>
        <span className="flex items-center gap-2" style={{ color: 'hsl(var(--chart-axis))' }}>
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-running))' }} /> В работе: {running}
        </span>
      </div>
    </div>
  );
}

export default function MainDashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('week');
  const [module, setModule] = useState<DashboardModule>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<DayPoint | null>(null);
  const [hoveredStacked, setHoveredStacked] = useState<DayPoint | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: Parameters<typeof getDashboard>[0] = { period, module };
      if (period === 'custom' && customFrom && customTo) {
        params.date_from = customFrom;
        params.date_to = customTo;
      }
      const res = await getDashboard(params);
      setData(res);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setLoadError(err?.response?.data?.detail || err?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [period, module, customFrom, customTo]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData: DayPoint[] = data
    ? data.runs_by_day.map((d) => ({
        date: d.date,
        dateShort: d.date.slice(5),
        total: d.total,
        success: d.success,
        error: d.errors,
        running: d.running,
      }))
    : [];

  const resultsLabel = module === 'seo' ? 'Домены' : module === 'leads' ? 'Контакты' : module === 'tenders' ? 'Тендеры' : 'Результаты';

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-[24px] font-semibold text-gray-900 dark:text-white">Дашборд</h1>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Модуль:</span>
            <select
              value={module}
              onChange={(e) => setModule(e.target.value as DashboardModule)}
              className="rounded-[6px] border border-gray-300 dark:border-gray-600 px-3 py-2 text-[14px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">Все</option>
              <option value="seo">SEO</option>
              <option value="leads">Поиск лидов</option>
              <option value="tenders">Госзакупки</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
              className="rounded-[6px] border border-gray-300 dark:border-gray-600 px-3 py-2 text-[14px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="custom">Свой период</option>
            </select>
            {period === 'custom' && (
              <span className="flex items-center gap-2 text-sm">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-[6px] border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-[14px] bg-white dark:bg-gray-800"
                />
                —
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-[6px] border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-[14px] bg-white dark:bg-gray-800"
                />
              </span>
            )}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="mb-6 rounded-[8px] border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4">
          <p className="text-red-700 dark:text-red-300">{loadError}</p>
          <button type="button" onClick={load} className="mt-2 text-sm font-medium text-red-600 dark:text-red-400 hover:underline">
            Повторить
          </button>
        </div>
      )}

      {/* KPI */}
      <section className="mb-10">
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Общий обзор</h2>
        {loading ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : data ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Всего запросов" value={data.kpi.total} />
            <KpiCard label="Успешные" value={data.kpi.success} />
            <KpiCard label="Ошибки" value={data.kpi.errors} />
            <KpiCard label="Ср. время" value={data.kpi.avg_time_sec != null ? `${Math.round(data.kpi.avg_time_sec)} с` : 'нет данных'} />
            <KpiCard label="Стоимость" value={data.kpi.has_cost_tarification ? `${data.kpi.cost_rub.toFixed(2)} ₽` : '0 ₽ (нет тарификации)'} />
            <KpiCard label={resultsLabel} value={data.kpi.results} />
          </div>
        ) : null}
      </section>

      {/* Сейчас выполняется */}
      <section className="mb-10">
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Сейчас выполняется</h2>
        <div className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : data && data.active_runs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left py-2 px-2">Модуль</th>
                    <th className="text-left py-2 px-2">Запрос</th>
                    <th className="text-left py-2 px-2">Статус</th>
                    <th className="text-left py-2 px-2">Прогресс</th>
                    <th className="text-left py-2 px-2">Время</th>
                    <th className="text-right py-2 px-2">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {data.active_runs.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2 px-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                          {r.module === 'seo' ? 'SEO' : r.module}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-900 dark:text-white truncate max-w-[200px]" title={r.query}>{r.query}</td>
                      <td className="py-2 px-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                          {r.status === 'running' ? 'В работе' : r.status === 'queued' ? 'В очереди' : r.status}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        {r.progress ? `${r.progress.found}/${r.progress.total}` : '—'}
                      </td>
                      <td className="py-2 px-2 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {r.duration_sec != null ? formatDuration(r.duration_sec) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Link
                          href={getRunUrl(r.module, r.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          Открыть <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">Сейчас нет активных запусков</p>
          )}
        </div>
      </section>

      {/* Последние запуски */}
      <section className="mb-10">
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Последние запуски</h2>
        <div className="rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : data && data.recent_runs.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-2 px-2">Дата/время</th>
                      <th className="text-left py-2 px-2">Модуль</th>
                      <th className="text-left py-2 px-2">Запрос</th>
                      <th className="text-left py-2 px-2">Статус</th>
                      <th className="text-left py-2 px-2">Результаты</th>
                      <th className="text-left py-2 px-2">Стоимость</th>
                      <th className="text-right py-2 px-2">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_runs.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                        <td className="py-2 px-2 text-gray-600 dark:text-gray-400">{formatDateTime(r.created_at)}</td>
                        <td className="py-2 px-2">
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            {r.module === 'seo' ? 'SEO' : r.module}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-gray-900 dark:text-white truncate max-w-[200px]" title={r.query}>{r.query}</td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            r.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                            r.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                            'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
                          }`}>
                            {r.status === 'completed' ? 'OK' : r.status === 'failed' ? 'Ошибка' : r.status}
                          </span>
                        </td>
                        <td className="py-2 px-2">{r.results}</td>
                        <td className="py-2 px-2">{r.cost_rub != null ? `${r.cost_rub.toFixed(2)} ₽` : '—'}</td>
                        <td className="py-2 px-2 text-right">
                          <Link
                            href={getRunUrl(r.module, r.id)}
                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                          >
                            Открыть <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Link href="/runs" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  Смотреть всё →
                </Link>
              </div>
            </>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">Запусков за период нет</p>
          )}
        </div>
      </section>

      {/* Запросы по дням */}
      <section className="mb-10">
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Запросы по дням</h2>
        <div
          className="rounded-[8px] border p-6 relative overflow-hidden"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--surface))', height: CHART_HEIGHT + 80 }}
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
              Нет данных за период
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

      {/* Ошибки / Успешные по дням */}
      <section className="mb-10">
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Ошибки / Успешные по дням</h2>
        <div className="flex items-center gap-4 mb-2">
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--chart-axis))' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-success))' }} /> Успешные
          </span>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--chart-axis))' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-error))' }} /> Ошибки
          </span>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--chart-axis))' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-running))' }} /> В работе
          </span>
        </div>
        <div
          className="rounded-[8px] border p-6 relative overflow-hidden"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--surface))', height: CHART_HEIGHT + 80 }}
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
              Нет данных за период
            </div>
          ) : data && data.kpi.total < 3 ? (
            <div className="absolute inset-6 flex items-center justify-center">
              <DonutChart success={data.kpi.success} errors={data.kpi.errors} running={data.kpi.total - data.kpi.success - data.kpi.errors} />
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

      {/* Модули */}
      <section>
        <h2 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-white">Модули</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { id: 'seo', title: 'SEO', desc: 'Аудит, проверки, история запросов', icon: Search, href: MODULE_ROUTES.seo },
            { id: 'leads', title: 'Поиск лидов', desc: 'Поиск, контакты, экспорт', icon: Users, href: MODULE_ROUTES.leads },
            { id: 'tenders', title: 'Госзакупки', desc: 'Мониторинг, история, фильтры', icon: BarChart3, href: MODULE_ROUTES.tenders },
          ].map((m) => {
            const Icon = m.icon;
            const stats = data?.kpi ?? { total: 0, success: 0, errors: 0 };
            return (
              <Link
                key={m.id}
                href={m.href}
                className="group rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6 transition-colors hover:border-blue-400 block"
              >
                <Icon className="mb-3 h-8 w-8 text-blue-600 dark:text-blue-400" />
                <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white">{m.title}</h3>
                <p className="mt-1 text-[14px] text-gray-600 dark:text-gray-400">{m.desc}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: 'hsl(var(--text))' }}>
                    {m.id === 'seo' ? `${stats.total} запросов · ${stats.success} OK · ${stats.errors} ошибок` : 'Скоро'}
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
