'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Download, Eye, Trash2, Search, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { listSearches, deleteSearch, getSearchResults } from '@/src/services/api/search';
import { exportToCSV, downloadCSV } from '@/lib/csv';
import { ToastContainer, type Toast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import type { Run } from '@/lib/types';

type StatusFilter = 'all' | 'done' | 'error' | 'pending' | 'processing';

export default function RunsHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRuns = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await listSearches();
      const mapped: Run[] = data
        .map((s) => ({
          id: String(s.id),
          keyword: s.query,
          geoCity: '',
          engine: s.search_provider,
          createdAt: new Date(s.created_at).getTime(),
          status: (s.status === 'completed' ? 'done' : s.status === 'failed' ? 'error' : s.status === 'processing' ? 'processing' : 'pending') as Run['status'],
          resultCount: s.result_count,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
      setRuns(mapped);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Ошибка загрузки';
      setLoadError(msg);
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const filteredRuns = useMemo(() => {
    let filtered = runs;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(run => 
        run.keyword.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(run => run.status === statusFilter);
    }

    return filtered;
  }, [runs, searchQuery, statusFilter]);

  const handleDelete = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Удалить этот запуск?')) return;
    try {
      await deleteSearch(parseInt(runId));
      await loadRuns();
      showToast('success', 'Запуск удалён');
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || err.message || 'Ошибка удаления');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Очистить всю историю? Это действие нельзя отменить.')) return;
    try {
      for (const r of runs) await deleteSearch(parseInt(r.id));
      await loadRuns();
      showToast('success', 'История очищена');
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || err.message || 'Ошибка очистки');
    }
  };

  const handleExportCSV = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleOpen = (runId: string) => {
    router.push(`/runs/${runId}`);
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
    const baseClass = 'inline-flex items-center justify-center gap-1 min-w-0 max-w-full h-6 px-2 rounded-full text-[12px] font-medium overflow-hidden text-ellipsis whitespace-nowrap';
    switch (status) {
      case 'done':
        return (
          <span className={`${baseClass} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`}>
            <CheckCircle className="h-3 w-3 shrink-0" />
            OK
          </span>
        );
      case 'error':
        return (
          <span className={`${baseClass} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300`}>
            <XCircle className="h-3 w-3 shrink-0" />
            Ошибка
          </span>
        );
      case 'pending':
      case 'processing':
        return (
          <span className={`${baseClass} bg-amber-100/90 text-amber-800 dark:bg-amber-900/25 dark:text-amber-200/90`} title="В процессе">
            <Clock className="h-3 w-3 shrink-0" />
            В работе
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 overflow-x-hidden">
        <div className="space-y-6">
          <PageHeader
            breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'История' }]}
            title="История запусков"
            actions={
              <>
                <Button variant="default" size="sm" onClick={() => router.push('/app/seo')} className="flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  Новый запуск
                </Button>
                <Button variant="destructive" size="sm" onClick={handleClearAll} className="flex items-center gap-1.5" disabled={runs.length === 0}>
                  <Trash2 className="h-4 w-4" />
                  Очистить историю
                </Button>
              </>
            }
          />

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 rounded-[12px] border border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-4 flex-1">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Поиск по запросу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-[160px]"
              >
                <option value="all">Все статусы</option>
                <option value="done">OK</option>
                <option value="error">Ошибка</option>
                <option value="pending">В процессе</option>
                <option value="processing">Обработка</option>
              </Select>
            </div>

          </div>

          {/* Loading */}
          {loadError && !loading ? (
            <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-red-200 dark:border-red-900/50 p-12 text-center">
              <p className="text-lg text-red-600 dark:text-red-400 mb-4">
                {loadError}
              </p>
              <Button variant="outline" onClick={loadRuns} className="gap-2">
                Повторить
              </Button>
            </div>
          ) : loading ? (
            <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-saas-primary mb-2" />
              <p className="text-gray-600 dark:text-gray-400">Загрузка…</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-12 text-center">
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                Запусков пока нет
              </p>
              <Button
                variant="default"
                onClick={() => router.push('/app/seo')}
                className="flex items-center gap-2 mx-auto"
              >
                <Plus className="h-4 w-4" />
                Сделать первый запуск
              </Button>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-12 text-center">
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Ничего не найдено
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block bg-white dark:bg-gray-800 rounded-[12px] border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm w-full min-w-0">
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full table-fixed" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '18%' }}>
                          Дата/Время
                        </th>
                        <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '22%' }}>
                          Запрос
                        </th>
                        <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '12%' }}>
                          Город
                        </th>
                        <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '12%' }}>
                          Поисковик
                        </th>
                        <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-[110px] shrink-0">
                          Статус
                        </th>
                        <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '10%' }}>
                          Результатов
                        </th>
                        <th className="text-right px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-[140px] shrink-0">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredRuns.map((run) => (
                        <tr
                          key={run.id}
                          className="h-[44px] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                          onClick={() => handleOpen(run.id)}
                        >
                          <td className="px-3 py-2 whitespace-nowrap overflow-hidden">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate" title={formatDate(run.createdAt)}>
                              {formatDate(run.createdAt)}
                            </div>
                          </td>
                          <td className="px-3 py-2 overflow-hidden">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate" title={run.keyword}>
                              {run.keyword}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap overflow-hidden">
                            <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                              {run.geoCity}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap overflow-hidden">
                            <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                              {run.engine}
                            </div>
                          </td>
                          <td className="px-2 py-2 w-[110px] shrink-0 overflow-hidden">
                            <span className="inline-flex items-center justify-center min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                              {getStatusBadge(run.status)}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                              {run.resultCount || 0}
                            </div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-right w-[140px] shrink-0">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpen(run.id);
                                }}
                                className="flex items-center gap-1.5"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Открыть
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleExportCSV(run.id, e)}
                                className="flex items-center gap-1.5"
                              >
                                <Download className="h-3.5 w-3.5" />
                                CSV
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleDelete(run.id, e)}
                                className="flex items-center gap-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {filteredRuns.map((run) => (
                  <div
                    key={run.id}
                    className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                          {run.keyword}
                        </h3>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {run.geoCity} • {formatDate(run.createdAt)}
                        </div>
                      </div>
                      <div className="ml-2">
                        {getStatusBadge(run.status)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Результатов: <span className="font-semibold text-gray-900 dark:text-white">{run.resultCount || 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpen(run.id)}
                          className="flex items-center gap-1.5 h-8"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Открыть
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleExportCSV(run.id, e)}
                          className="flex items-center gap-1.5 h-8"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDelete(run.id, e)}
                          className="flex items-center gap-1.5 h-8 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
}
