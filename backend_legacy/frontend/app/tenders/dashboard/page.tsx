'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, ExternalLink } from 'lucide-react';

type Period = 'day' | 'week' | 'month' | 'custom';

const MOCK_KPI = { requests: 7, success: 6, errors: 1, avgTime: '5.1 с', cost: '—', leads: '—', domains: 22 };
const MOCK_CHART = [1, 1, 2, 1, 1, 2, 1];
const MOCK_RUNS = [
  { id: 't1', date: '25.01 09:15', query: 'Строительные работы', status: 'done', results: 8 },
  { id: 't2', date: '24.01 17:00', query: 'IT-услуги', status: 'error', results: 0 },
];

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-[8px] border p-4"
      style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="text-[12px] font-medium" style={{ color: 'hsl(var(--muted))' }}>{label}</div>
      <div className="mt-1 text-[18px] font-semibold" style={{ color: 'hsl(var(--text))' }}>{value}</div>
    </div>
  );
}

export default function TendersDashboardPage() {
  const [period, setPeriod] = useState<Period>('week');

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-[24px] font-semibold" style={{ color: 'hsl(var(--text))' }}>Дашборд: Госзакупки</h1>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" style={{ color: 'hsl(var(--muted))' }} />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-[6px] border px-3 py-2 text-[14px] bg-transparent"
            style={{ color: 'hsl(var(--text))', borderColor: 'hsl(var(--border))' }}
          >
            <option value="day">День</option>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
            <option value="custom">Свой период</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 mb-8">
        <KpiCard label="Запросы" value={MOCK_KPI.requests} />
        <KpiCard label="Успешные" value={MOCK_KPI.success} />
        <KpiCard label="Ошибки" value={MOCK_KPI.errors} />
        <KpiCard label="Ср. время" value={MOCK_KPI.avgTime} />
        <KpiCard label="Стоимость" value={MOCK_KPI.cost} />
        <KpiCard label="Лидов" value={MOCK_KPI.leads} />
        <KpiCard label="Домены" value={MOCK_KPI.domains} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <div
          className="rounded-[8px] border p-6 h-[200px] flex items-end gap-2"
          style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
        >
          {MOCK_CHART.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full rounded-t-[4px]"
                style={{ height: `${(h / 2) * 140}px`, backgroundColor: '#2563eb' }}
              />
              <span className="text-[11px]" style={{ color: 'hsl(var(--muted))' }}>Д{i + 1}</span>
            </div>
          ))}
        </div>
        <div
          className="rounded-[8px] border p-6 h-[200px] flex items-end gap-2"
          style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
        >
          {MOCK_CHART.map((h, i) => (
            <div key={i} className="flex-1 flex gap-1 items-end" style={{ height: 140 }}>
              <div className="flex-1 rounded-t-[4px]" style={{ height: `${(h / 2) * 100}px`, backgroundColor: 'hsl(142 76% 36%)' }} />
              <div className="flex-1 rounded-t-[4px]" style={{ height: `${((2 - h) / 2) * 40}px`, backgroundColor: 'hsl(var(--danger))' }} />
            </div>
          ))}
        </div>
      </div>

      <section>
        <h2 className="text-[16px] font-semibold mb-4" style={{ color: 'hsl(var(--text))' }}>Последние запуски</h2>
        <div className="rounded-[8px] border overflow-hidden" style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}>
          <table className="w-full text-[14px]">
            <thead>
              <tr style={{ backgroundColor: 'hsl(var(--surface-2))' }}>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'hsl(var(--text))' }}>Дата</th>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'hsl(var(--text))' }}>Запрос</th>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'hsl(var(--text))' }}>Статус</th>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'hsl(var(--text))' }}>Результаты</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {MOCK_RUNS.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                  <td className="py-3 px-4" style={{ color: 'hsl(var(--muted))' }}>{r.date}</td>
                  <td className="py-3 px-4" style={{ color: 'hsl(var(--text))' }}>{r.query}</td>
                  <td className="py-3 px-4">
                    <span className={r.status === 'done' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {r.status === 'done' ? 'OK' : 'Ошибка'}
                    </span>
                  </td>
                  <td className="py-3 px-4" style={{ color: 'hsl(var(--text))' }}>{r.results}</td>
                  <td className="py-3 px-4">
                    <Link href={`/runs/${r.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: 'hsl(var(--accent))' }}>
                      Открыть <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
