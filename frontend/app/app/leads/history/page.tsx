'use client';

/**
 * §4.3 ТЗ редизайна 2026-06-03 — История поисков.
 * Карточки на CardV2 с hover-lift, display-шрифт на запросе,
 * SignalPill для статуса, reveal-stack для появления.
 * max-w-7xl чтобы убрать пустоту по бокам на десктопе.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { listSearches, deleteSearch } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import { Eye, Trash2, Download, Loader2, MoreVertical } from 'lucide-react';

import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill } from '@/components/ui/SignalPill';
import { Skeleton } from '@/components/ui/Skeleton';
import { ButtonV2 } from '@/components/ui/ButtonV2';

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

function statusTone(s: string): 'good' | 'hot' | 'warm' | 'muted' {
  if (s === 'completed') return 'good';
  if (s === 'failed') return 'hot';
  if (s === 'processing' || s === 'running' || s === 'pending') return 'warm';
  return 'muted';
}

export default function LeadsHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<SearchResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display font-semibold tracking-tight"
            style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}>
          История поисков лидов
        </h1>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[72px]" rounded="lg" />)}
        </div>
      ) : runs.length === 0 ? (
        <CardV2 className="px-6 py-12 text-center text-sm text-[hsl(var(--muted))] bg-mesh-brand">
          История пустая — запустите первый поиск
        </CardV2>
      ) : (
        <ul className="reveal-stack space-y-2" ref={menuRef}>
          {runs.map((r, idx) => (
            <li key={r.id}>
              <CardV2
                interactive
                reveal
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/runs/${r.id}`)}
                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') router.push(`/runs/${r.id}`); }}
                className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5"
              >
                <span className="hidden w-10 shrink-0 text-center text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))] sm:inline">
                  #{String(page * PAGE_SIZE + idx + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[14px] font-semibold text-[hsl(var(--text))]" title={r.query}>
                    {r.query}
                  </div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--muted))]">
                    {formatDateTime(r.created_at)} · {r.search_provider} · {r.result_count ?? 0} {(r.result_count ?? 0) === 1 ? 'лид' : 'лидов'}
                  </div>
                </div>
                <SignalPill tone={statusTone(r.status)} size="sm">{statusLabel(r.status)}</SignalPill>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => router.push(`/runs/${r.id}`)}
                    className="hidden min-h-9 items-center gap-1 px-2 text-[13px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 sm:inline-flex"
                  >
                    <Eye className="h-4 w-4" />
                    Открыть
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                      className="grid h-9 w-9 place-items-center rounded-v2-sm text-[hsl(var(--muted))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]"
                      aria-label="Меню"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === r.id && (
                      <div
                        className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-v2 border bg-[hsl(var(--surface))] py-1 shadow-v2"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        {r.status === 'completed' && (
                          <a
                            href={`/api/v1/searches/${r.id}/results/export/csv`}
                            download
                            onClick={() => setOpenMenuId(null)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))]"
                          >
                            <Download className="h-4 w-4" /> Скачать CSV
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => { setOpenMenuId(null); handleDelete(r.id); }}
                          disabled={deletingId === r.id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[color:var(--signal-hot)] hover:bg-[var(--signal-hot-bg)] disabled:opacity-40"
                        >
                          {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </CardV2>
            </li>
          ))}
        </ul>
      )}

      {!loading && runs.length > 0 && (
        <CardV2 className="mt-4 flex items-center justify-between px-4 py-3 text-sm text-[hsl(var(--muted))]">
          <span>Страница {page + 1}</span>
          <div className="flex gap-2">
            <ButtonV2
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              ← Назад
            </ButtonV2>
            <ButtonV2
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={runs.length < PAGE_SIZE}
            >
              Вперёд →
            </ButtonV2>
          </div>
        </CardV2>
      )}
    </div>
  );
}
