'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { listSearches, deleteSearch } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import { Eye, Trash2, Download, Loader2, MoreVertical } from 'lucide-react';

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

function statusBadgeClass(s: string): string {
  if (s === 'completed') return 'app-badge app-badge-success';
  if (s === 'failed') return 'app-badge app-badge-danger';
  if (s === 'processing' || s === 'running' || s === 'pending') return 'app-badge app-badge-warning';
  return 'app-badge app-badge-accent';
}

export default function LeadsHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<SearchResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

      {/* Card list — same style as /app/leads "Последние запуски" */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-[64px] app-skeleton" style={{ borderRadius: 4 }} />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div
          className="p-12 text-center rounded-[8px] border"
          style={{
            background: 'hsl(var(--surface))',
            border: '1px dashed hsl(var(--border))',
          }}
        >
          <p className="text-sm" style={{ color: 'hsl(var(--muted))' }}>
            История пустая — запустите первый поиск
          </p>
        </div>
      ) : (
        <div className="space-y-1.5" ref={menuRef}>
          {runs.map((r, idx) => (
            <div
              key={r.id}
              className="app-run-card cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/runs/${r.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/runs/${r.id}`); }}
            >
              <span className="app-mono-label shrink-0 w-10 text-center" style={{ color: 'hsl(var(--muted))' }}>
                #{String(page * PAGE_SIZE + idx + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate" style={{ color: 'hsl(var(--text))' }} title={r.query}>
                  {r.query}
                </div>
                <div className="app-mono-label mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
                  {formatDateTime(r.created_at)} · {r.search_provider} · {r.result_count ?? 0} {(r.result_count ?? 0) === 1 ? 'лид' : 'лидов'}
                </div>
              </div>
              <span className={statusBadgeClass(r.status)}>{statusLabel(r.status)}</span>
              <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => router.push(`/runs/${r.id}`)}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold transition-opacity hover:opacity-80"
                  style={{ color: 'hsl(var(--accent))' }}
                >
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Открыть</span>
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] transition-colors"
                    style={{ color: 'hsl(var(--muted))' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent-weak))')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openMenuId === r.id && (
                    <div
                      className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-[8px] border shadow-lg py-1"
                      style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
                    >
                      {r.status === 'completed' && (
                        <a
                          href={`/api/v1/searches/${r.id}/results/export/csv`}
                          download
                          onClick={() => setOpenMenuId(null)}
                          className="flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                          style={{ color: 'hsl(var(--text))' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent-weak))')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                        >
                          <Download className="h-4 w-4" /> Скачать CSV
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => { setOpenMenuId(null); handleDelete(r.id); }}
                        disabled={deletingId === r.id}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors disabled:opacity-40"
                        style={{ color: 'hsl(var(--danger))' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--danger) / 0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                      >
                        {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Пагинация */}
      {!loading && runs.length > 0 && (
        <div
          className="mt-4 px-4 py-3 flex items-center justify-between text-sm rounded-[8px] border"
          style={{
            background: 'hsl(var(--surface))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--muted))',
          }}
        >
          <span>Страница {page + 1}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
              onMouseEnter={(e) => { if (page !== 0) e.currentTarget.style.background = 'hsl(var(--accent-weak))'; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              ← Назад
            </button>
            <button
              type="button"
              onClick={() => setPage(p => p + 1)}
              disabled={runs.length < PAGE_SIZE}
              className="px-3 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
              onMouseEnter={(e) => { if (runs.length >= PAGE_SIZE) e.currentTarget.style.background = 'hsl(var(--accent-weak))'; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              Вперёд →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
