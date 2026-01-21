'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download, Eye, Copy as CopyIcon, CheckCircle, XCircle } from 'lucide-react';
import { getRuns } from '@/lib/storage';
import { exportToCSV, downloadCSV, generateMockResults } from '@/lib/mock';
import { getRunResults } from '@/lib/storage';
import { IssueIcons } from '@/components/IssueIcons';
import type { Run, LeadRow } from '@/lib/types';

export default function RunsHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [filterPhoneOnly, setFilterPhoneOnly] = useState(false);
  const [filterErrors, setFilterErrors] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [demoResults] = useState<LeadRow[]>(() => generateMockResults(15));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setRuns(getRuns());
    }
  }, []);

  // Если нет запусков, показываем демо-таблицу
  const showDemoTable = runs.length === 0;
  const displayResults = showDemoTable ? demoResults : [];

  const filteredResults = useMemo(() => {
    if (showDemoTable) {
      let filtered = demoResults;

      if (filterPhoneOnly) {
        filtered = filtered.filter(row => row.phone);
      }

      if (filterErrors) {
        filtered = filtered.filter(row => {
          const hasBadIssue = !row.issues.robots || !row.issues.sitemap || 
                             !row.issues.titleDuplicates || !row.issues.descriptionDuplicates;
          return row.status === 'error' || hasBadIssue;
        });
      }

      return filtered;
    }
    return [];
  }, [demoResults, filterPhoneOnly, filterErrors, showDemoTable]);

  const handleCopy = async (row: LeadRow) => {
    await navigator.clipboard.writeText(row.outreachText);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = async () => {
    const allText = filteredResults.map(r => r.outreachText).join('\n\n');
    await navigator.clipboard.writeText(allText);
  };

  const handleExportCSV = () => {
    const csv = exportToCSV(filteredResults);
    downloadCSV(csv, 'spinlid-demo-results.csv');
  };

  const handleExportCSVForRun = (runId: string) => {
    const results = getRunResults(runId);
    const csv = exportToCSV(results);
    downloadCSV(csv, `spinlid-run-${runId}.csv`);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-4xl font-bold text-gray-900 dark:text-white">
        {showDemoTable ? 'История запусков' : 'История запусков'}
      </h2>

      {/* Filters and Actions - только если показываем таблицу результатов */}
      {showDemoTable && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterPhoneOnly}
                onChange={(e) => setFilterPhoneOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Только с телефоном</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterErrors}
                onChange={(e) => setFilterErrors(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Ошибки</span>
            </label>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportCSV}
              className="flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              Скачать CSV
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCopyAll}
              className="flex items-center gap-1.5"
            >
              <CopyIcon className="h-4 w-4" />
              Копировать всё
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {showDemoTable ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Domain
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Issues
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Ничего не найдено
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {row.domain}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {row.phone || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {row.email || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {row.score}
                      </td>
                      <td className="px-4 py-3">
                        <IssueIcons issues={row.issues} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(row)}
                            className="h-7 px-3 text-xs"
                          >
                            {copiedId === row.id ? 'Скопировано' : 'Копировать'}
                          </Button>
                          <span
                            className={`text-sm font-medium ${
                              row.status === 'error' 
                                ? 'text-red-600 dark:text-red-400' 
                                : 'text-green-600 dark:text-green-400'
                            }`}
                          >
                            {row.status === 'error' ? 'Ошибка' : 'OK'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Дата/Время
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Ключевое слово
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
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(run.createdAt).toLocaleString('ru-RU')}
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
                        {run.engine === 'yandex' ? 'Яндекс' : 'Google'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {run.status === 'done' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          <CheckCircle className="h-3 w-3" />
                          Завершено
                        </span>
                      ) : run.status === 'error' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                          <XCircle className="h-3 w-3" />
                          Ошибка
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                          {run.status}
                        </span>
                      )}
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
                          onClick={() => router.push(`/runs/${run.id}`)}
                          className="flex items-center gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Открыть
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportCSVForRun(run.id)}
                          className="flex items-center gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5" />
                          CSV
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
