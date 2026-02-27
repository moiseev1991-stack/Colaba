'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { listSearches, deleteSearch } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import { ExternalLink, Trash2, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(s: string): string {
  if (s === 'completed') return 'OK';
  if (s === 'failed') return 'Ошибка';
  if (s === 'processing' || s === 'running') return 'В работе';
  return 'Ожидание';
}

export default function LeadsHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<SearchResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await listSearches({ limit: PAGE_SIZE, offset: p * PAGE_SIZE });
      setRuns(data);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить этот запуск и все его результаты?')) return;
    setDeletingId(id);
    try {
      await deleteSearch(id);
      await load(page);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold" style={{ color: 'hsl(var(--text))' }}>История поисков лидов</h1>
      </div>

      <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Загрузка…
          </div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            История пустая — запустите первый поиск
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Дата</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Запрос</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Провайдер</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Статус</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Результатов</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="py-3 px-4 truncate max-w-[200px]" title={r.query} style={{ color: 'hsl(var(--text))' }}>{r.query}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{r.search_provider}</td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        'px-2 py-0.5 rounded text-xs',
                        r.status === 'completed' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                        r.status === 'failed' && 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
                        (r.status === 'processing' || r.status === 'pending') && 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
                      )}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4" style={{ color: 'hsl(var(--text))' }}>{r.result_count ?? 0}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {r.status === 'completed' && (
                          <a
                            href={`/api/v1/searches/${r.id}/results/export/csv`}
                            download
                            className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            title="Скачать CSV"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => router.push(`/runs/${r.id}`)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline bg-transparent border-0 p-0 cursor-pointer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          disabled={deletingId === r.id}
                          className="inline-flex items-center text-xs text-red-500 dark:text-red-400 hover:text-red-700 bg-transparent border-0 p-0 cursor-pointer disabled:opacity-40"
                          title="Удалить"
                        >
                          {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Пагинация */}
        {!loading && (
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
                disabled={runs.length < PAGE_SIZE}
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
