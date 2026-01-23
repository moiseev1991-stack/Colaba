'use client';

import { useState, useMemo } from 'react';
import { Copy, ExternalLink, Ban } from 'lucide-react';
import { Button } from './ui/button';
import { IssueIcons } from './IssueIcons';
import type { LeadRow } from '@/lib/types';
import { isBlacklisted, addToBlacklist } from '@/lib/storage';
import { exportToCSV, downloadCSV } from '@/lib/mock';

interface LeadsTableProps {
  results: LeadRow[];
  runId?: string;
}

export function LeadsTable({ results, runId }: LeadsTableProps) {
  const [filterPhoneOnly, setFilterPhoneOnly] = useState(false);
  const [filterErrors, setFilterErrors] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredResults = useMemo(() => {
    let filtered = results;

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
  }, [results, filterPhoneOnly, filterErrors]);

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
    const filename = runId ? `spinlid-results-${runId}.csv` : 'spinlid-results.csv';
    downloadCSV(csv, filename);
  };

  const handleAddToBlacklist = (domain: string) => {
    addToBlacklist(domain);
    // Optionally refresh or show notification
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterPhoneOnly}
              onChange={(e) => setFilterPhoneOnly(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Только с телефоном</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterErrors}
              onChange={(e) => setFilterErrors(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Ошибки</span>
          </label>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            Скачать CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyAll}>
            Копировать всё
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-300 dark:border-gray-700">
              <th className="text-left p-3 text-sm font-medium text-gray-700 dark:text-gray-300">Domain</th>
              <th className="text-left p-3 text-sm font-medium text-gray-700 dark:text-gray-300">Phone</th>
              <th className="text-left p-3 text-sm font-medium text-gray-700 dark:text-gray-300">Email</th>
              <th className="text-left p-3 text-sm font-medium text-gray-700 dark:text-gray-300">Score</th>
              <th className="text-left p-3 text-sm font-medium text-gray-700 dark:text-gray-300">Issues</th>
              <th className="text-left p-3 text-sm font-medium text-gray-700 dark:text-gray-300">Status</th>
              <th className="text-left p-3 text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              filteredResults.map((row) => {
                const blacklisted = isBlacklisted(row.domain);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="p-3 text-sm">{row.domain}</td>
                    <td className="p-3 text-sm">{row.phone || '-'}</td>
                    <td className="p-3 text-sm">{row.email || '-'}</td>
                    <td className="p-3 text-sm">{row.score}</td>
                    <td className="p-3">
                      <IssueIcons issues={row.issues} />
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-sm ${
                          row.status === 'error' ? 'text-red-500' : 'text-green-500'
                        }`}
                      >
                        {row.status === 'error' ? 'Ошибка' : 'OK'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(row)}
                          className="h-8"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          {copiedId === row.id ? 'Скопировано' : 'Копировать'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`https://${row.domain}`, '_blank')}
                          className="h-8 w-8"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {!blacklisted && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAddToBlacklist(row.domain)}
                            className="h-8 w-8"
                            title="В blacklist"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
