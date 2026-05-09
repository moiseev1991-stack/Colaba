'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Eye, Trash2, Search, Plus, CheckCircle, XCircle, Loader2, MoreVertical, Copy } from 'lucide-react';
import { listSearches, deleteSearch, getSearchResults } from '@/src/services/api/search';
import { exportToCSV, downloadCSV } from '@/lib/csv';
import { ToastContainer, type Toast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import type { Run } from '@/lib/types';
import type { SearchResponse } from '@/src/services/api/search';

type StatusFilter = 'all' | 'done' | 'error' | 'pending' | 'processing';
type PeriodFilter = 'week' | 'month' | 'all';

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  week: 'Неделя',
  month: 'Месяц',
  all: 'Все',
};

function mapSearchToRun(s: SearchResponse): Run {
  const status = s.status === 'completed' ? 'done' : s.status === 'failed' ? 'error' : s.status === 'processing' ? 'processing' : 'pending';
  const geoCity = (s.config && typeof s.config === 'object' && s.config.city) ? String(s.config.city) : '';
  return {
    id: String(s.id),
    keyword: s.query,
    geoCity,
    engine: s.search_provider,
    createdAt: new Date(s.created_at).getTime(),
    status: status as Run['status'],
    resultCount: s.result_count,
  };
}

export default function RunsHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('week');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadRuns = useCallback(async (period: PeriodFilter) => {
    try {
      setLoading(true);
      setLoadError(null);
      const apiPeriod = period === 'all' ? undefined : period;
      const data = await listSearches({ limit: 200, period: apiPeriod });
      const mapped = data.map(mapSearchToRun).sort((a, b) => b.createdAt - a.createdAt);
      setRuns(mapped);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Ошибка загрузки';
      setLoadError(msg);
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns(periodFilter);
  }, [loadRuns, periodFilter]);

  const filteredRuns = useMemo(() => {
    let filtered = runs;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(run => run.keyword.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        filtered = filtered.filter(run => run.status === 'pending' || run.status === 'processing');
      } else {
        filtered = filtered.filter(run => run.status === statusFilter);
      }
    }
    return filtered;
  }, [runs, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const done = runs.filter(r => r.status === 'done').length;
    const error = runs.filter(r => r.status === 'error').length;
    const inProgress = runs.filter(r => r.status === 'pending' || r.status === 'processing').length;
    return { total: runs.length, done, error, inProgress };
  }, [runs]);

  const handleDelete = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (!confirm('Удалить этот запуск?')) return;
    try {
      await deleteSearch(parseInt(runId));
      await loadRuns(periodFilter);
      showToast('success', 'Запуск удалён');
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || err.message || 'Ошибка удаления');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Очистить всю историю? Это действие нельзя отменить.')) return;
    try {
      for (const r of runs) await deleteSearch(parseInt(r.id));
      await loadRuns(periodFilter);
      showToast('success', 'История очищена');
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || err.message || 'Ошибка очистки');
    }
  };

  const handleExportCSV = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    try {
      const resultsData = await getSearchResults(parseInt(runId));
      const rows = resultsData.map((r: any) => ({
        domain: r.domain || '',
        phone: r.phone ?? null,
        email: r.email ?? null,
        score: r.seo_score ?? 0,
        issues: { robots: true, sitemap: true, titleDuplicates: true, descriptionDuplicates: true },
        status: (r.contact_status === 'found' || r.contact_status === 'no_contacts') ? 'ok' : 'error',
      }));
      if (rows.length === 0) {
        showToast('error', 'Нет данных для CSV');
        return;
      }
      downloadCSV(exportToCSV(rows), `colaba-run-${runId}.csv`);
      showToast('success', 'CSV скачан');
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || err.message || 'Ошибка экспорта');
    }
  };

  const handleCopyAll = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    try {
      const resultsData = await getSearchResults(parseInt(runId));
      const text = resultsData.map((r: any) => [r.domain, r.phone, r.email].filter(Boolean).join('\t')).join('\n');
      await navigator.clipboard.writeText(text || '');
      showToast('success', 'Скопировано');
    } catch {
      showToast('error', 'Не удалось скопировать');
    }
  };

  const handleOpen = (runId: string) => {
    window.location.href = `/runs/${runId}`;
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPeriodFilter('all');
  };

  const showToast = (type: Toast['type'], message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  };

  const getStatusBadge = (status: Run['status']) => {
    switch (status) {
      case 'done':
        return (
          <span className="app-badge app-badge-success">
            <CheckCircle className="h-3 w-3 shrink-0" />
            OK
          </span>
        );
      case 'error':
        return (
          <span className="app-badge app-badge-danger">
            <XCircle className="h-3 w-3 shrink-0" />
            Ошибка
          </span>
        );
      case 'pending':
      case 'processing':
        return (
          <span className="app-badge app-badge-warning" title="В процессе">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            В работе
          </span>
        );
      default:
        return null;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <>
      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 overflow-x-hidden relative z-10">
        <div className="space-y-4">
          {/* Header */}
          <div className="app-reveal">
            <PageHeader
              breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'История' }]}
              title="История запусков"
            actions={
              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" onClick={() => router.push('/app/seo')} className="flex items-center gap-1.5 h-9">
                  <Plus className="h-4 w-4" />
                  Новый запуск
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  className="flex items-center gap-1.5 h-9"
                  style={{
                    borderColor: 'hsl(var(--danger) / 0.5)',
                    color: 'hsl(var(--danger))',
                  }}
                  disabled={runs.length === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  Очистить историю
                </Button>
              </div>
            }
          />
          </div>

          {/* Summary chips */}
          {!loading && runs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm app-reveal app-reveal-delay-1">
              <span className="app-badge app-badge-accent">
                Всего: {stats.total}
              </span>
              <span className="app-badge app-badge-success">
                OK: {stats.done}
              </span>
              <span className="app-badge app-badge-danger">
                Ошибки: {stats.error}
              </span>
              <span className="app-badge app-badge-warning">
                В работе: {stats.inProgress}
              </span>
              <span style={{ color: 'hsl(var(--muted))' }}>•</span>
              <span style={{ color: 'hsl(var(--muted))' }}>За период:</span>
              {(['week', 'month', 'all'] as PeriodFilter[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodFilter(p)}
                  className={`app-chip ${periodFilter === p ? 'app-chip-active' : ''}`}
                  style={{ padding: '4px 12px' }}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}

          {/* Filter panel (sticky) */}
          <div className="sticky top-0 z-10 py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 app-reveal app-reveal-delay-2" style={{ background: 'hsl(var(--bg) / 0.95)', backdropFilter: 'blur(12px)' }}>
            <div className="app-card-enhanced p-4">
              {loadError && !loading && (
                <div
                  className="mb-4 rounded-[10px] border px-4 py-3 flex items-center justify-between gap-4"
                  style={{
                    background: 'hsl(var(--danger) / 0.1)',
                    borderColor: 'hsl(var(--danger) / 0.3)',
                  }}
                >
                  <p className="text-sm" style={{ color: 'hsl(var(--danger))' }}>{loadError}</p>
                  <Button variant="outline" size="sm" onClick={() => loadRuns(periodFilter)}>Повторить</Button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'hsl(var(--muted))' }} />
                  <Input
                    type="text"
                    placeholder="Поиск по запросу..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 rounded-[10px]"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {(['all', 'done', 'error', 'pending'] as const).map((s) => {
                    const isActive = s === 'pending'
                      ? (statusFilter === 'pending' || statusFilter === 'processing')
                      : statusFilter === s;
                    return (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className="px-3 py-1.5 rounded-[10px] text-xs font-medium transition-colors"
                      style={
                        isActive
                          ? { background: 'hsl(var(--accent))', color: 'white' }
                          : { background: 'hsl(var(--surface-2))', color: 'hsl(var(--muted))' }
                      }
                    >
                      {s === 'all' ? 'Все' : s === 'done' ? 'OK' : s === 'error' ? 'Ошибки' : 'В работе'}
                    </button>
                  );})}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="app-card-enhanced p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 mb-2" style={{ borderColor: 'hsl(var(--accent))' }} />
              <p style={{ color: 'hsl(var(--muted))' }}>Загрузка…</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="app-card-enhanced p-12 text-center">
              <p className="text-lg mb-4" style={{ color: 'hsl(var(--text))' }}>Запусков пока нет</p>
              <Button variant="default" onClick={() => router.push('/app/seo')} className="flex items-center gap-2 mx-auto ui-btn-primary app-btn-shine">
                <Plus className="h-4 w-4" />
                Сделать первый запуск
              </Button>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="app-card-enhanced p-12 text-center">
              <p className="text-lg mb-4" style={{ color: 'hsl(var(--text))' }}>Ничего не найдено</p>
              <Button variant="outline" onClick={resetFilters} className="gap-2">
                Сбросить фильтры
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop Cards — same style as /app/leads "Последние запуски" */}
              <div className="hidden md:block app-reveal app-reveal-delay-3">
                <div className="space-y-1.5">
                  {filteredRuns.map((run, idx) => (
                    <div
                      key={run.id}
                      className="app-run-card cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpen(run.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleOpen(run.id); }}
                    >
                      <span className="app-mono-label shrink-0 w-10 text-center" style={{ color: 'hsl(var(--muted))' }}>
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold truncate" style={{ color: 'hsl(var(--text))' }} title={run.keyword}>
                          {run.keyword}
                        </div>
                        <div className="app-mono-label mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
                          {formatDate(run.createdAt)}
                          {(run.geoCity || run.engine) && ` · ${[run.geoCity, run.engine].filter(Boolean).join(' · ')}`}
                          {' · '}{run.resultCount ?? 0} {(run.resultCount ?? 0) === 1 ? 'лид' : 'лидов'}
                        </div>
                      </div>
                      {getStatusBadge(run.status)}
                      <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleOpen(run.id); }}
                          className="inline-flex items-center gap-1 text-[13px] font-semibold transition-opacity hover:opacity-80"
                          style={{ color: 'hsl(var(--accent))' }}
                        >
                          <Eye className="h-4 w-4" />
                          <span className="hidden sm:inline">Открыть</span>
                        </button>
                        <div className="relative" ref={openMenuId === run.id ? menuRef : undefined}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === run.id ? null : run.id); }}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] transition-colors"
                            style={{ color: 'hsl(var(--muted))' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent-weak))')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuId === run.id && (
                            <div
                              className="absolute right-0 top-full mt-1 py-1 rounded-[10px] border shadow-lg z-20 min-w-[160px]"
                              style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
                            >
                              <button
                                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 rounded-[8px] mx-1 transition-colors"
                                style={{ color: 'hsl(var(--text))' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent-weak))')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                                onClick={(e) => handleExportCSV(run.id, e)}
                              >
                                <Download className="h-4 w-4" />
                                Скачать CSV
                              </button>
                              <button
                                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 rounded-[8px] mx-1 transition-colors"
                                style={{ color: 'hsl(var(--text))' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent-weak))')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                                onClick={(e) => handleCopyAll(run.id, e)}
                              >
                                <Copy className="h-4 w-4" />
                                Копировать всё
                              </button>
                              <button
                                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 rounded-[8px] mx-1 transition-colors"
                                style={{ color: 'hsl(var(--danger))' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--danger) / 0.1)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                                onClick={(e) => handleDelete(run.id, e)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Удалить запуск
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {filteredRuns.map((run) => (
                  <div
                    key={run.id}
                    className="app-card-enhanced p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--text))' }}>{run.keyword}</h3>
                        <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
                          {(run.geoCity || run.engine) ? [run.geoCity, run.engine].filter(Boolean).join(' • ') : formatDate(run.createdAt)}
                        </div>
                      </div>
                      {getStatusBadge(run.status)}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                      <span className="text-sm" style={{ color: 'hsl(var(--muted))' }}>
                        Результатов: <strong style={{ color: 'hsl(var(--text))' }}>{run.resultCount ?? 0}</strong>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpen(run.id)}
                          className="inline-flex items-center gap-1.5 h-8 px-2 rounded-[10px] text-[13px] font-semibold transition-opacity hover:opacity-80"
                          style={{ color: 'hsl(var(--accent))' }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Открыть
                        </button>
                        <div className="relative" ref={openMenuId === run.id ? menuRef : undefined}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === run.id ? null : run.id); }}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                          {openMenuId === run.id && (
                            <div className="absolute right-0 top-full mt-1 py-1 rounded-[10px] shadow-lg z-20 min-w-[160px]" style={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))' }}>
                              <button
                                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 rounded-[8px] mx-1 transition-colors"
                                style={{ color: 'hsl(var(--text))' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent-weak))')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                                onClick={(e) => handleExportCSV(run.id, e)}
                              >
                                <Download className="h-4 w-4" /> Скачать CSV
                              </button>
                              <button
                                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 rounded-[8px] mx-1 transition-colors"
                                style={{ color: 'hsl(var(--text))' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent-weak))')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                                onClick={(e) => handleCopyAll(run.id, e)}
                              >
                                <Copy className="h-4 w-4" /> Копировать всё
                              </button>
                              <button
                                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 rounded-[8px] mx-1 transition-colors"
                                style={{ color: 'hsl(var(--danger))' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--danger) / 0.1)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                                onClick={(e) => handleDelete(run.id, e)}
                              >
                                <Trash2 className="h-4 w-4" /> Удалить запуск
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
}
