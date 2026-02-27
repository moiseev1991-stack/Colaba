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
    router.push(`/runs/${runId}`);
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
    const base = 'inline-flex items-center justify-center gap-1 h-6 min-w-[72px] px-2.5 rounded-[8px] text-xs font-medium';
    switch (status) {
      case 'done':
        return (
          <span className={`${base} bg-green-500/15 text-green-700 dark:text-green-400`}>
            <CheckCircle className="h-3 w-3 shrink-0" />
            OK
          </span>
        );
      case 'error':
        return (
          <span className={`${base} bg-red-500/15 text-red-700 dark:text-red-400`}>
            <XCircle className="h-3 w-3 shrink-0" />
            Ошибка
          </span>
        );
      case 'pending':
      case 'processing':
        return (
          <span className={`${base} bg-blue-500/15 text-blue-700 dark:text-blue-400`} title="В процессе">
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
      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div className="space-y-4">
          {/* Header */}
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
                  className="flex items-center gap-1.5 h-9 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                  disabled={runs.length === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  Очистить историю
                </Button>
              </div>
            }
          />

          {/* Summary chips */}
          {!loading && runs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="px-2.5 py-1 rounded-[10px] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium">
                Всего: {stats.total}
              </span>
              <span className="px-2.5 py-1 rounded-[10px] bg-green-500/10 text-green-700 dark:text-green-400 font-medium">
                OK: {stats.done}
              </span>
              <span className="px-2.5 py-1 rounded-[10px] bg-red-500/10 text-red-700 dark:text-red-400 font-medium">
                Ошибки: {stats.error}
              </span>
              <span className="px-2.5 py-1 rounded-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium">
                В работе: {stats.inProgress}
              </span>
              <span className="text-gray-500 dark:text-gray-400">•</span>
              <span className="text-gray-500 dark:text-gray-400">За период:</span>
              {(['week', 'month', 'all'] as PeriodFilter[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodFilter(p)}
                  className={`px-2.5 py-1 rounded-[10px] text-sm font-medium transition-colors ${
                    periodFilter === p
                      ? 'bg-saas-primary text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}

          {/* Filter panel (sticky) */}
          <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 dark:supports-[backdrop-filter]:bg-gray-900/80 py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-gray-200 dark:border-gray-700">
            <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
              {loadError && !loading && (
                <div className="mb-4 rounded-[10px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-4 py-3 flex items-center justify-between gap-4">
                  <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
                  <Button variant="outline" size="sm" onClick={() => loadRuns(periodFilter)}>Повторить</Button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                      className={`px-3 py-1.5 rounded-[10px] text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-saas-primary text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
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
            <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-saas-primary mb-2" />
              <p className="text-gray-600 dark:text-gray-400">Загрузка…</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
              <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">Запусков пока нет</p>
              <Button variant="default" onClick={() => router.push('/app/seo')} className="flex items-center gap-2 mx-auto">
                <Plus className="h-4 w-4" />
                Сделать первый запуск
              </Button>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
              <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">Ничего не найдено</p>
              <Button variant="outline" onClick={resetFilters} className="gap-2">
                Сбросить фильтры
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
                  <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead className="sticky top-0 z-[1] bg-gray-50 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[140px]">Дата/Время</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Запрос</th>
                        <th className="text-left px-2 py-2.5 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[90px] shrink-0">Статус</th>
                        <th className="text-left px-2 py-2.5 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[90px] shrink-0">Результатов</th>
                        <th className="text-right px-2 py-2.5 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-[120px] shrink-0">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRuns.map((run, i) => (
                        <tr
                          key={run.id}
                          className={`h-[40px] cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800/80 ${
                            i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/50'
                          } hover:bg-saas-primary-weak dark:hover:bg-saas-primary-weak/20`}
                          onClick={() => handleOpen(run.id)}
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="text-sm text-gray-700 dark:text-gray-300" title={formatDate(run.createdAt)}>
                              {formatDate(run.createdAt)}
                            </span>
                          </td>
                          <td className="px-3 py-2 overflow-hidden">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={run.keyword}>
                                {run.keyword}
                              </div>
                              {(run.geoCity || run.engine) && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {[run.geoCity, run.engine].filter(Boolean).join(' • ')}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 w-[90px] shrink-0">{getStatusBadge(run.status)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{run.resultCount ?? 0}</span>
                          </td>
                          <td className="px-2 py-2 text-right w-[120px] shrink-0" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleOpen(run.id); }}
                                className="h-7 px-2 rounded-[10px] gap-1"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Открыть
                              </Button>
                              <div className="relative" ref={openMenuId === run.id ? menuRef : undefined}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-[10px]"
                                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === run.id ? null : run.id); }}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                                {openMenuId === run.id && (
                                  <div className="absolute right-0 top-full mt-1 py-1 rounded-[10px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-20 min-w-[160px]">
                                    <button
                                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 rounded-[8px] mx-1"
                                      onClick={(e) => handleExportCSV(run.id, e)}
                                    >
                                      <Download className="h-4 w-4" />
                                      Скачать CSV
                                    </button>
                                    <button
                                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 rounded-[8px] mx-1"
                                      onClick={(e) => handleCopyAll(run.id, e)}
                                    >
                                      <Copy className="h-4 w-4" />
                                      Копировать всё
                                    </button>
                                    <button
                                      className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 rounded-[8px] mx-1"
                                      onClick={(e) => handleDelete(run.id, e)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Удалить запуск
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {filteredRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{run.keyword}</h3>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {(run.geoCity || run.engine) ? [run.geoCity, run.engine].filter(Boolean).join(' • ') : formatDate(run.createdAt)}
                        </div>
                      </div>
                      {getStatusBadge(run.status)}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Результатов: <strong>{run.resultCount ?? 0}</strong></span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpen(run.id)} className="h-8 gap-1.5 rounded-[10px]">
                          <Eye className="h-3.5 w-3.5" />
                          Открыть
                        </Button>
                        <div className="relative" ref={openMenuId === run.id ? menuRef : undefined}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === run.id ? null : run.id); }}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                          {openMenuId === run.id && (
                            <div className="absolute right-0 top-full mt-1 py-1 rounded-[10px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-20 min-w-[160px]">
                              <button className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 rounded-[8px] mx-1" onClick={(e) => handleExportCSV(run.id, e)}>
                                <Download className="h-4 w-4" /> Скачать CSV
                              </button>
                              <button className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 rounded-[8px] mx-1" onClick={(e) => handleCopyAll(run.id, e)}>
                                <Copy className="h-4 w-4" /> Копировать всё
                              </button>
                              <button className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 rounded-[8px] mx-1" onClick={(e) => handleDelete(run.id, e)}>
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
