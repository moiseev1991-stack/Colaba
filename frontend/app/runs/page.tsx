'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Download, Eye, Trash2, Search, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { getRuns, deleteRun, clearAllRuns, getRunResults } from '@/lib/storage';
import { exportToCSV, downloadCSV } from '@/lib/mock';
import { ToastContainer, type Toast } from '@/components/Toast';
import type { Run } from '@/lib/types';

type StatusFilter = 'all' | 'done' | 'error' | 'pending' | 'processing';

export default function RunsHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      loadRuns();
    }
  }, []);

  const loadRuns = () => {
    const allRuns = getRuns();
    // Sort by createdAt desc
    const sorted = allRuns.sort((a, b) => b.createdAt - a.createdAt);
    setRuns(sorted);
  };

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

  const handleDelete = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Удалить этот запуск?')) {
      deleteRun(runId);
      loadRuns();
      showToast('success', 'Запуск удалён');
    }
  };

  const handleClearAll = () => {
    if (confirm('Очистить всю историю? Это действие нельзя отменить.')) {
      clearAllRuns();
      loadRuns();
      showToast('success', 'История очищена');
    }
  };

  const handleExportCSV = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const results = getRunResults(runId);
    if (results.length === 0) {
      showToast('error', 'Нет данных для CSV');
      return;
    }
    const csv = exportToCSV(results);
    downloadCSV(csv, `spinlid-run-${runId}.csv`);
    showToast('success', 'CSV скачан');
  };

  const handleOpen = (runId: string) => {
    // Always open demo results page (frontend-only, no API calls)
    router.push('/runs/demo?demo=true');
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
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <CheckCircle className="h-3 w-3" />
            OK
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <XCircle className="h-3 w-3" />
            Ошибка
          </span>
        );
      case 'pending':
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
            <Clock className="h-3 w-3" />
            В процессе
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="max-w-[1250px] mx-auto px-6">
        <div className="space-y-6">
          {/* Header */}
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            История запусков
          </h1>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700">
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

            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => router.push('/')}
                className="flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Новый запуск
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAll}
                className="flex items-center gap-1.5"
                disabled={runs.length === 0}
              >
                <Trash2 className="h-4 w-4" />
                Очистить историю
              </Button>
            </div>
          </div>

          {/* Empty State */}
          {runs.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                Запусков пока нет
              </p>
              <Button
                variant="default"
                onClick={() => router.push('/')}
                className="flex items-center gap-2 mx-auto"
              >
                <Plus className="h-4 w-4" />
                Сделать первый запуск
              </Button>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Ничего не найдено
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Дата/Время
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Запрос
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Город
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Поисковик
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Статус
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Результатов
                        </th>
                        <th className="text-right px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredRuns.map((run) => (
                        <tr
                          key={run.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                          onClick={() => handleOpen(run.id)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatDate(run.createdAt)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {run.keyword}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              {run.geoCity}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              Яндекс
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(run.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                              {run.resultCount || 0}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
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
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
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
