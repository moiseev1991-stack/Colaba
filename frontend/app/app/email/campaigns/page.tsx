'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { listCampaigns, type EmailCampaign } from '@/src/services/api/emailCampaigns';
import { Mail, Eye, Loader2, CheckCircle, XCircle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: 'Черновик',
    sending: 'Отправка',
    completed: 'Завершена',
    failed: 'Ошибка',
  };
  return map[s] || s;
}

function statusColor(s: string): string {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    sending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };
  return map[s] || 'bg-gray-100 text-gray-700';
}

export default function CampaignsHistoryPage() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await listCampaigns({ limit: PAGE_SIZE, offset: p * PAGE_SIZE });
      setCampaigns(data);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const deliveryRate = (c: EmailCampaign): number => {
    if (c.sent_count === 0) return 0;
    return Math.round((c.delivered_count / c.sent_count) * 100);
  };

  const openRate = (c: EmailCampaign): number => {
    if (c.delivered_count === 0) return 0;
    return Math.round((c.opened_count / c.delivered_count) * 100);
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--text))' }}>
          <Mail className="h-5 w-5" />
          История рассылок
        </h1>
        <Link
          href="/app/email/stats"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Статистика
        </Link>
      </div>

      <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Загрузка…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Нет рассылок. Запустите первую рассылку из результатов поиска.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Дата</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Название</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Статус</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Отправлено</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Доставлено</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Открыто</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Возвраты</th>
                  <th className="py-3 px-4 text-right text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">Действия</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                    <td className="py-3 px-4 truncate max-w-[200px]" title={c.name} style={{ color: 'hsl(var(--text))' }}>
                      {c.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn('px-2 py-0.5 rounded text-xs', statusColor(c.status))}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center" style={{ color: 'hsl(var(--text))' }}>
                      {c.sent_count} / {c.total_recipients}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="flex items-center justify-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        <span style={{ color: 'hsl(var(--text))' }}>{c.delivered_count}</span>
                        <span className="text-xs text-gray-400">({deliveryRate(c)}%)</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="flex items-center justify-center gap-1">
                        <Eye className="h-3.5 w-3.5 text-blue-500" />
                        <span style={{ color: 'hsl(var(--text))' }}>{c.opened_count}</span>
                        <span className="text-xs text-gray-400">({openRate(c)}%)</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="flex items-center justify-center gap-1">
                        {c.bounced_count > 0 && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                        <span style={{ color: 'hsl(var(--text))' }}>{c.bounced_count}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/app/email/campaigns/${c.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" /> Детали
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Пагинация */}
        {!loading && campaigns.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>Страница {page + 1}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Назад
              </button>
              <button
                type="button"
                onClick={() => setPage(p => p + 1)}
                disabled={campaigns.length < PAGE_SIZE}
                className="px-3 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Вперёд →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
