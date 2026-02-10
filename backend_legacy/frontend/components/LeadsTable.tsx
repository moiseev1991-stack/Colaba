'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink, Ban, Download, ChevronDown, ChevronUp, ChevronsUpDown, Check, X, MoreVertical, Phone, Mail, ChevronLeft, ChevronRight, FileSearch, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Select } from './ui/select';
import type { LeadRow } from '@/lib/types';
import { isBlacklisted, addToBlacklist, getResultsPageSize, setResultsPageSize } from '@/lib/storage';
import { exportToCSV, downloadCSV } from '@/lib/csv';
import { ToastContainer, type Toast } from './Toast';
import { runResultAudit } from '@/src/services/api/search';
import { addDomainToBlacklist as addDomainToBlacklistApi } from '@/src/services/api/blacklist';

const AUDIT_DATA_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут

/** Данные появились: в строке есть результат SEO-аудита */
function hasFirstData(row: LeadRow): boolean {
  return row.seo != null;
}

interface LeadsTableProps {
  results: LeadRow[];
  runId?: string;
  onAuditComplete?: () => void;
}

type ViewMode = 'compact' | 'all';
type SortField = 'domain' | 'score' | null;
type SortOrder = 'asc' | 'desc';

export function LeadsTable({ results, runId, onAuditComplete }: LeadsTableProps) {
  const router = useRouter();
  const tableRef = useRef<HTMLDivElement>(null);
  
  const [filterPhoneOnly, setFilterPhoneOnly] = useState(false);
  const [filterErrors, setFilterErrors] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const viewMode: ViewMode = 'compact';
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showMobileActions, setShowMobileActions] = useState(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionRowState, setActionRowState] = useState<Record<string, { state: 'loading' | 'error'; startedAt: number; firstDataAt?: number; errorMessage?: string }>>({});
  const [blacklistVersion, setBlacklistVersion] = useState(0);

  // Pagination state - initialize from URL and localStorage
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlPageSize = urlParams.get('pageSize');
      if (urlPageSize) {
        const size = parseInt(urlPageSize, 10);
        if ([10, 25, 50, 100].includes(size)) {
          setResultsPageSize(size);
          return size;
        }
      }
    }
    return getResultsPageSize();
  });
  
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const page = parseInt(urlParams.get('page') || '1', 10);
      return isNaN(page) || page < 1 ? 1 : page;
    }
    return 1;
  });
  
  // Sync URL params on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlPage = urlParams.get('page');
      const urlPageSize = urlParams.get('pageSize');
      
      if (urlPage) {
        const page = parseInt(urlPage, 10);
        if (!isNaN(page) && page >= 1) {
          setCurrentPage(page);
        }
      }
      
      if (urlPageSize) {
        const size = parseInt(urlPageSize, 10);
        if ([10, 25, 50, 100].includes(size)) {
          setPageSize(size);
          setResultsPageSize(size);
        }
      } else {
        // If no pageSize in URL, update URL with current localStorage value
        updateURL(currentPage, pageSize);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // При появлении первых данных — убираем спиннер; при таймауте — показываем ошибку
  const checkFirstDataAndTimeout = useCallback(() => {
    const now = Date.now();
    setActionRowState((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const rowId of Object.keys(next)) {
        const entry = next[rowId];
        if (entry.state !== 'loading') continue;
        const row = results.find((r) => r.id === rowId);
        if (row && hasFirstData(row)) {
          delete next[rowId];
          changed = true;
        } else if (now - entry.startedAt > AUDIT_DATA_TIMEOUT_MS) {
          next[rowId] = {
            state: 'error',
            startedAt: entry.startedAt,
            errorMessage: 'Данные не появились (timeout)',
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [results]);

  useEffect(() => {
    checkFirstDataAndTimeout();
  }, [checkFirstDataAndTimeout]);

  // Таймаут: если родитель перестал обновлять results (polling stopped), всё равно проверяем
  useEffect(() => {
    const id = setInterval(checkFirstDataAndTimeout, 15000); // каждые 15 сек
    return () => clearInterval(id);
  }, [checkFirstDataAndTimeout]);

  // Close mobile actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileActionsRef.current && !mobileActionsRef.current.contains(event.target as Node)) {
        setShowMobileActions(false);
      }
    };

    if (showMobileActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [showMobileActions]);

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

  const sortedResults = useMemo(() => {
    if (!sortField) return filteredResults;
    
    const sorted = [...filteredResults].sort((a, b) => {
      if (sortField === 'domain') {
        const comparison = a.domain.localeCompare(b.domain);
        return sortOrder === 'asc' ? comparison : -comparison;
      } else if (sortField === 'score') {
        return sortOrder === 'asc' ? a.score - b.score : b.score - a.score;
      }
      return 0;
    });
    
    return sorted;
  }, [filteredResults, sortField, sortOrder]);

  // Pagination calculations
  const totalResults = sortedResults.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedResults = useMemo(() => {
    return sortedResults.slice(startIndex, endIndex);
  }, [sortedResults, startIndex, endIndex]);

  // Adjust current page if it's out of bounds (e.g., after filtering)
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      const newPage = totalPages;
      setCurrentPage(newPage);
      updateURL(newPage, pageSize);
    }
  }, [totalPages, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage > 1) {
      setCurrentPage(1);
      updateURL(1, pageSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPhoneOnly, filterErrors]);

  // Update URL when page or pageSize changes
  const updateURL = (page: number, size: number) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('page', page.toString());
    url.searchParams.set('pageSize', size.toString());
    router.push(url.pathname + url.search, { scroll: false });
  };

  // Handle page size change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setResultsPageSize(newSize);
    setCurrentPage(1);
    updateURL(1, newSize);
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      updateURL(newPage, pageSize);
    }
  };

  // Generate page numbers with ellipsis
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleCopy = async (row: LeadRow) => {
    await navigator.clipboard.writeText(row.outreachText);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = async () => {
    const allText = sortedResults.map(r => r.outreachText).join('\n\n');
    await navigator.clipboard.writeText(allText);
  };

  const handleExportCSV = () => {
    const csv = exportToCSV(sortedResults);
    const filename = runId ? `spinlid-results-${runId}.csv` : 'spinlid-results.csv';
    downloadCSV(csv, filename);
  };

  const handleAddToBlacklist = async (domain: string) => {
    try {
      await addDomainToBlacklistApi(domain);
      addToBlacklist(domain);
      showToast('success', 'Домен добавлен в блэклист');
      setBlacklistVersion((v) => v + 1);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast('error', err?.response?.data?.detail || 'Не удалось добавить в блэклист');
    }
  };

  const handleRunAudit = async (row: LeadRow) => {
    if (!runId) return;
    const rowId = row.id;
    const current = actionRowState[rowId];
    if (current?.state === 'loading') return; // debounce
    setActionRowState((s) => ({ ...s, [rowId]: { state: 'loading', startedAt: Date.now() } }));
    try {
      await runResultAudit(parseInt(runId, 10), parseInt(rowId, 10));
      onAuditComplete?.(); // триггер refetch — данные появятся позже через polling
      // НЕ переводим в idle: спиннер крутится до появления данных (см. useEffect)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const msg = err?.response?.data?.detail || err?.message || 'Ошибка SEO-аудита';
      showToast('error', msg);
      setActionRowState((s) => ({
        ...s,
        [rowId]: { state: 'error', startedAt: s[rowId]?.startedAt ?? Date.now(), errorMessage: msg },
      }));
    }
  };

  const toggleRowDetails = (rowId: string) => {
    setExpandedRow(expandedRow === rowId ? null : rowId);
  };

  // Format Meta summary: при наличии SEO — сводка по аудиту, иначе — данные из поиска (сразу без аудита)
  const formatMetaSummary = (seo?: LeadRow['seo'], row?: LeadRow): string => {
    if (seo) {
      const parts: string[] = [];
      const titleDupMatch = seo.metaTitle.match(/дублируется\s+(\d+)%/);
      if (titleDupMatch) parts.push(`Title dup ${titleDupMatch[1]}%`);
      const descEmptyMatch = seo.metaDesc.match(/не найден\s+(\d+)%/);
      if (descEmptyMatch) parts.push(`Desc empty ${descEmptyMatch[1]}%`);
      const h1MissMatch = seo.h1.match(/не найден\s+(\d+)%/);
      if (h1MissMatch) parts.push(`H1 miss ${h1MissMatch[1]}%`);
      return parts.length > 0 ? parts.join(' • ') : '-';
    }
    // Данные из поиска — показываем сразу, без ожидания SEO-аудита
    if (row?.snippetFromSearch?.trim()) return row.snippetFromSearch.trim();
    if (row?.titleFromSearch?.trim()) return row.titleFromSearch.trim();
    return '-';
  };

  // Get top issues
  const getTopIssues = (row: LeadRow): string[] => {
    const issues: string[] = [];
    const seo = row.seo;
    
    if (seo) {
      if (seo.robots !== 'OK') issues.push(`Robots: ${seo.robots}`);
      if (seo.sitemap !== 'OK') issues.push(`Sitemap: ${seo.sitemap}`);
      
      const titleDup = seo.metaTitle.match(/дублируется\s+(\d+)%/);
      if (titleDup && parseInt(titleDup[1]) > 20) {
        issues.push(`Meta Title дублируется ${titleDup[1]}%`);
      }
    }
    
    return issues.slice(0, 3);
  };

  // Check if contact exists
  const hasPhone = (phone: string | null): boolean => {
    return Boolean(phone && phone.trim() !== '-' && phone.trim() !== '');
  };

  const hasEmail = (email: string | null): boolean => {
    return Boolean(email && email.trim() !== '-' && email.trim() !== '');
  };

  // Copy to clipboard with fallback
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  };

  // Show toast notification
  const showToast = (type: Toast['type'], message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Handle phone copy
  const handleCopyPhone = async (e: React.MouseEvent, phone: string | null) => {
    e.stopPropagation();
    if (!hasPhone(phone)) {
      showToast('error', 'Телефон не найден');
      return;
    }
    const success = await copyToClipboard(phone!);
    if (success) {
      showToast('success', 'Телефон скопирован');
    } else {
      showToast('error', 'Не удалось скопировать телефон');
    }
  };

  // Handle email copy
  const handleCopyEmail = async (e: React.MouseEvent, email: string | null) => {
    e.stopPropagation();
    if (!hasEmail(email)) {
      showToast('error', 'Email не найден');
      return;
    }
    const success = await copyToClipboard(email!);
    if (success) {
      showToast('success', 'Email скопирован');
    } else {
      showToast('error', 'Не удалось скопировать email');
    }
  };

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full overflow-x-hidden" ref={tableRef} key={blacklistVersion}>
      {/* Filters, Actions and View Mode */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-[12px] border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Desktop Toolbar */}
        <div className="hidden md:flex flex-wrap items-center justify-between gap-3 px-3 py-2">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterPhoneOnly}
                onChange={(e) => setFilterPhoneOnly(e.target.checked)}
                className="w-4 h-4 rounded-[4px] border-gray-300 dark:border-gray-600 text-saas-primary focus:ring-saas-primary"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Только с телефоном</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterErrors}
                onChange={(e) => setFilterErrors(e.target.checked)}
                className="w-4 h-4 rounded-[4px] border-gray-300 dark:border-gray-600 text-saas-primary focus:ring-saas-primary"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Ошибки</span>
            </label>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Показано: <span className="font-medium">{paginatedResults.length}</span> из{' '}
              <span className="font-medium">{totalResults}</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-gray-300">Показывать по:</span>
              <Select
                value={pageSize.toString()}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
                className="w-20 h-8 text-sm"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </Select>
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
                <Copy className="h-4 w-4" />
                Копировать всё
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Toolbar */}
        <div className="md:hidden px-3 py-2 space-y-2">
          {/* Row 1: Checkboxes */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filterPhoneOnly}
                onChange={(e) => setFilterPhoneOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded-[4px] border-gray-300 dark:border-gray-600 text-saas-primary focus:ring-saas-primary"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">Только с телефоном</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filterErrors}
                onChange={(e) => setFilterErrors(e.target.checked)}
                className="w-3.5 h-3.5 rounded-[4px] border-gray-300 dark:border-gray-600 text-saas-primary focus:ring-saas-primary"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">Ошибки</span>
            </label>
          </div>
          
          {/* Row 2: Показано N из M + Page Size + Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-700 dark:text-gray-300">
              Показано: <span className="font-medium">{paginatedResults.length}</span> из{' '}
              <span className="font-medium">{totalResults}</span>
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-[160px]">
              <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap flex-shrink-0">По:</span>
              <Select
                value={pageSize.toString()}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
                className="flex-1 min-w-[140px] h-8 text-xs"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </Select>
            </div>

            {/* Actions Menu */}
            <div className="relative flex-shrink-0" ref={mobileActionsRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMobileActions(!showMobileActions)}
                className="h-8 px-2"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              {showMobileActions && (
                <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[12px] shadow-lg z-50 min-w-[160px]">
                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowMobileActions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Скачать CSV
                  </button>
                  <button
                    onClick={() => {
                      handleCopyAll();
                      setShowMobileActions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Копировать всё
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-[12px] border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm w-full min-w-0 max-w-full">
        <div className="overflow-x-hidden w-full">
          <table className="w-full table-fixed min-w-0" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {viewMode === 'compact' ? (
                  <>
                    <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wider w-[180px] max-w-[220px]">
                      <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none min-w-0" onClick={() => handleSort('domain')}>
                        Domain
                        {sortField === 'domain' ? (
                          sortOrder === 'asc' ? (
                            <ChevronUp className="h-3 w-3 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-3 w-3 flex-shrink-0" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-30 flex-shrink-0" />
                        )}
                      </div>
                    </th>
                    <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-12">
                      <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none" onClick={() => handleSort('score')}>
                        Score
                        {sortField === 'score' ? (
                          sortOrder === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </div>
                    </th>
                    <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '10%' }}>
                      Tech
                    </th>
                    <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-16">
                      Контакты
                    </th>
                    <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '28%', maxWidth: 480 }}>
                      Meta
                    </th>
                    <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-14">
                      Pages
                    </th>
                    <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-[110px] shrink-0">
                      Status
                    </th>
                    <th className="text-left px-2 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-[140px] shrink-0">
                      Actions
                    </th>
                  </>
                ) : (
                  <>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-48">Domain</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-40">Phone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-48">Email</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-16">Score</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-20">Robots</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-20">Sitemap</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-32">Meta Title</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-32">Meta Desc</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-28">H1</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-24">Pages Crawled</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-20">Status</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-28">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedResults.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'compact' ? 8 : 12} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Ничего не найдено
                  </td>
                </tr>
              ) : (
                paginatedResults.map((row) => {
                  const blacklisted = isBlacklisted(row.domain);
                  const seo = row.seo;
                  const isExpanded = expandedRow === row.id;
                  const metaSummary = formatMetaSummary(seo, row);
                  
                  return (
                    <>
                      <tr
                        key={row.id}
                        className={`h-[44px] transition-colors ${actionRowState[row.id]?.state === 'loading' ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                      >
                        {viewMode === 'compact' ? (
                          <>
                            <td 
                              className="px-2 py-2 text-sm font-medium text-gray-900 dark:text-white cursor-pointer align-middle min-w-0 max-w-[220px]"
                              onClick={() => toggleRowDetails(row.id)}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                )}
                                <span className="block truncate min-w-0" title={row.domain}>{row.domain}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-sm font-medium text-gray-900 dark:text-white text-center align-middle">
                              {row.score}
                            </td>
                            <td className="px-2 py-2 align-middle min-w-0">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  {seo ? (seo.robots === 'OK' ? (
                                    <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : (
                                    <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                  )) : (
                                    <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                  )}
                                  <span className="text-xs truncate block min-w-0">
                                    <span className="text-gray-500 dark:text-gray-400">R:</span>{' '}
                                    <span className="text-gray-700 dark:text-gray-300">{seo?.robots || '-'}</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {seo ? (seo.sitemap === 'OK' ? (
                                    <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : (
                                    <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                  )) : (
                                    <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                  )}
                                  <span className="text-xs truncate block min-w-0">
                                    <span className="text-gray-500 dark:text-gray-400">S:</span>{' '}
                                    <span className="text-gray-700 dark:text-gray-300">{seo?.sitemap || '-'}</span>
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => handleCopyPhone(e, row.phone)}
                                  title={hasPhone(row.phone) ? 'Скопировать телефон' : 'Телефон не найден'}
                                  aria-label={hasPhone(row.phone) ? 'Скопировать телефон' : 'Телефон не найден'}
                                  className={`cursor-pointer hover:opacity-80 transition-opacity ${!hasPhone(row.phone) ? 'cursor-not-allowed opacity-50' : ''}`}
                                  disabled={!hasPhone(row.phone)}
                                >
                                  <Phone 
                                    className={`h-4 w-4 ${hasPhone(row.phone) 
                                      ? 'text-green-600 dark:text-green-400' 
                                      : 'text-red-600 dark:text-red-400'
                                    }`}
                                  />
                                </button>
                                <button
                                  onClick={(e) => handleCopyEmail(e, row.email)}
                                  title={hasEmail(row.email) ? 'Скопировать email' : 'Email не найден'}
                                  aria-label={hasEmail(row.email) ? 'Скопировать email' : 'Email не найден'}
                                  className={`cursor-pointer hover:opacity-80 transition-opacity ${!hasEmail(row.email) ? 'cursor-not-allowed opacity-50' : ''}`}
                                  disabled={!hasEmail(row.email)}
                                >
                                  <Mail 
                                    className={`h-4 w-4 ${hasEmail(row.email) 
                                      ? 'text-green-600 dark:text-green-400' 
                                      : 'text-red-600 dark:text-red-400'
                                    }`}
                                  />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2 align-middle min-w-0 max-w-[480px]">
                              <p 
                                className="text-xs text-gray-600 dark:text-gray-400 truncate w-full max-w-full"
                                title={metaSummary}
                              >
                                {metaSummary}
                              </p>
                            </td>
                            <td className="px-2 py-2 text-sm text-gray-700 dark:text-gray-300 text-center align-middle">
                              {seo?.pagesCrawled || '-'}
                            </td>
                            <td className="px-2 py-2 align-middle w-[110px] shrink-0 overflow-hidden">
                              <span
                                className={`inline-flex items-center justify-center min-w-0 max-w-full rounded-full h-6 px-2 text-[12px] font-medium whitespace-nowrap overflow-hidden text-ellipsis ${
                                  row.status === 'error'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                    : row.status === 'processing'
                                      ? 'bg-amber-100/90 text-amber-800 dark:bg-amber-900/25 dark:text-amber-200/90'
                                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                }`}
                                title={row.status === 'error' ? 'Ошибка' : row.status === 'processing' ? 'Обработка' : 'OK'}
                              >
                                {row.status === 'error' ? 'Ошибка' : row.status === 'processing' ? 'В работе' : 'OK'}
                              </span>
                            </td>
                            <td className="px-2 py-2 align-middle w-[140px] shrink-0 relative z-[1]">
                              <div className="flex items-center justify-end gap-1.5 flex-shrink-0">
                                {actionRowState[row.id]?.state === 'loading' ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400" title="Идёт аудит…">
                                    <Loader2 className="h-4 w-4 animate-spin text-saas-primary shrink-0" />
                                    <span className="hidden sm:inline">В работе</span>
                                  </span>
                                ) : actionRowState[row.id]?.state === 'error' ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => { e.stopPropagation(); handleCopy(row); }}
                                      className="h-8 w-8 min-w-[32px] shrink-0"
                                      title={copiedId === row.id ? 'Скопировано' : 'Копировать'}
                                    >
                                      {copiedId === row.id ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => { e.stopPropagation(); window.open(`https://${row.domain}`, '_blank'); }}
                                      className="h-8 w-8 min-w-[32px] shrink-0"
                                      title="Открыть"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                    <span
                                      className="inline-flex items-center text-red-600 dark:text-red-400"
                                      title={actionRowState[row.id]?.errorMessage || 'Ошибка аудита'}
                                    >
                                      <AlertCircle className="h-4 w-4 shrink-0" />
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => { e.stopPropagation(); handleRunAudit(row); }}
                                      className="h-8 w-8 min-w-[32px] shrink-0"
                                      title="Повторить"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                    {!blacklisted && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => { e.stopPropagation(); handleAddToBlacklist(row.domain); }}
                                        className="h-9 w-9 min-w-[36px] text-gray-500 hover:text-saas-danger"
                                        title="Blacklist"
                                      >
                                        <Ban className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => { e.stopPropagation(); handleCopy(row); }}
                                      className="h-8 w-8 min-w-[32px] shrink-0"
                                      title={copiedId === row.id ? 'Скопировано' : 'Копировать'}
                                    >
                                      {copiedId === row.id ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => { e.stopPropagation(); window.open(`https://${row.domain}`, '_blank'); }}
                                      className="h-8 w-8 min-w-[32px] shrink-0"
                                      title="Открыть"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                    {runId && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => { e.stopPropagation(); handleRunAudit(row); }}
                                        className="h-8 w-8 min-w-[32px] shrink-0"
                                        title="SEO-аудит"
                                      >
                                        <FileSearch className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {!blacklisted && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => { e.stopPropagation(); handleAddToBlacklist(row.domain); }}
                                        className="h-9 w-9 min-w-[36px] text-gray-500 hover:text-saas-danger"
                                        title="Blacklist"
                                      >
                                        <Ban className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                              {row.domain}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {row.phone || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {row.email || '-'}
                            </td>
                            <td className="px-3 py-3 text-sm font-medium text-gray-900 dark:text-white text-center">
                              {row.score}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {seo ? (
                                <span className={seo.robots === 'OK' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {seo.robots}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {seo ? (
                                <span className={seo.sitemap === 'OK' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {seo.sitemap}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-700 dark:text-gray-300">
                              {seo?.metaTitle || '-'}
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-700 dark:text-gray-300">
                              {seo?.metaDesc || '-'}
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-700 dark:text-gray-300">
                              {seo?.h1 || '-'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300 text-center">
                              {seo?.pagesCrawled || '-'}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`text-sm font-medium ${
                                  row.status === 'error' 
                                    ? 'text-red-600 dark:text-red-400' 
                                    : 'text-green-600 dark:text-green-400'
                                }`}
                              >
                                {row.status === 'error' ? 'Ошибка' : 'OK'}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1">
                                {actionRowState[row.id]?.state === 'loading' ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400" title="Идёт аудит…">
                                    <Loader2 className="h-4 w-4 animate-spin text-saas-primary shrink-0" />
                                    В работе
                                  </span>
                                ) : actionRowState[row.id]?.state === 'error' ? (
                                  <>
                                    <Button variant="ghost" size="icon" onClick={() => handleCopy(row)} className="h-7 w-7" title={copiedId === row.id ? 'Скопировано' : 'Копировать'}>
                                      {copiedId === row.id ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => window.open(`https://${row.domain}`, '_blank')} className="h-7 w-7" title="Открыть">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                    <span className="inline-flex items-center text-red-600 dark:text-red-400" title={actionRowState[row.id]?.errorMessage || 'Ошибка аудита'}>
                                      <AlertCircle className="h-4 w-4 shrink-0" />
                                    </span>
                                    <Button variant="ghost" size="icon" onClick={() => handleRunAudit(row)} className="h-7 w-7" title="Повторить">
                                      <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                    {!blacklisted && (
                                      <Button variant="ghost" size="icon" onClick={() => handleAddToBlacklist(row.domain)} className="h-7 w-7 text-gray-500 hover:text-red-600 dark:hover:text-red-400" title="Blacklist">
                                        <Ban className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <Button variant="ghost" size="icon" onClick={() => handleCopy(row)} className="h-7 w-7" title={copiedId === row.id ? 'Скопировано' : 'Копировать'}>
                                      {copiedId === row.id ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => window.open(`https://${row.domain}`, '_blank')} className="h-7 w-7" title="Открыть">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                    {runId && (
                                      <Button variant="ghost" size="icon" onClick={() => handleRunAudit(row)} className="h-7 w-7" title="SEO-аудит">
                                        <FileSearch className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {!blacklisted && (
                                      <Button variant="ghost" size="icon" onClick={() => handleAddToBlacklist(row.domain)} className="h-7 w-7 text-gray-500 hover:text-red-600 dark:hover:text-red-400" title="Blacklist">
                                        <Ban className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                      
                      {/* Row Details (Accordion) - только в compact режиме */}
                      {viewMode === 'compact' && isExpanded && (
                        <tr className="bg-gray-50 dark:bg-gray-900/30">
                          <td colSpan={8} className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              {(row.titleFromSearch || row.snippetFromSearch || row.urlFromSearch) && (
                                <>
                                  <div className="col-span-2 md:col-span-3">
                                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Из поиска</div>
                                    <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                                      {row.titleFromSearch && <div><span className="text-gray-500 dark:text-gray-500">Заголовок:</span> {row.titleFromSearch}</div>}
                                      {row.snippetFromSearch && <div><span className="text-gray-500 dark:text-gray-500">Сниппет:</span> {row.snippetFromSearch}</div>}
                                      {row.urlFromSearch && (
                                        <div>
                                          <span className="text-gray-500 dark:text-gray-500">URL:</span>{' '}
                                          <a href={row.urlFromSearch} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-full inline-block">{row.urlFromSearch}</a>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                              <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Robots</div>
                                <div className={seo?.robots === 'OK' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {seo?.robots || '-'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Sitemap</div>
                                <div className={seo?.sitemap === 'OK' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {seo?.sitemap || '-'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Pages Crawled</div>
                                <div className="text-gray-700 dark:text-gray-300">{seo?.pagesCrawled || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Meta Title</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">{seo?.metaTitle || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Meta Desc</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">{seo?.metaDesc || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">H1</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">{seo?.h1 || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Phone</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">{row.phone || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Email</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">{row.email || '-'}</div>
                              </div>
                              {getTopIssues(row).length > 0 && (
                                <div className="col-span-2 md:col-span-3">
                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Top Issues</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400">
                                    {getTopIssues(row).join(' • ')}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {paginatedResults.map((row) => {
          const seo = row.seo;
          const isExpanded = expandedRow === row.id;
          const metaSummary = formatMetaSummary(seo, row);
          
          return (
            <div
              key={row.id}
              className={`rounded-[14px] border p-3 shadow-sm ${actionRowState[row.id]?.state === 'loading' ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
            >
              {/* Header: Domain + Contacts + Status */}
              <div className="flex items-center justify-between mb-2">
                <div 
                  className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer flex items-center gap-1.5 flex-1 min-w-0"
                  onClick={() => toggleRowDetails(row.id)}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  )}
                  <span className="line-clamp-1 truncate">{row.domain}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Contacts Icons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => handleCopyPhone(e, row.phone)}
                      title={hasPhone(row.phone) ? 'Скопировать телефон' : 'Телефон не найден'}
                      aria-label={hasPhone(row.phone) ? 'Скопировать телефон' : 'Телефон не найден'}
                      className={`cursor-pointer hover:opacity-80 transition-opacity ${!hasPhone(row.phone) ? 'cursor-not-allowed opacity-50' : ''}`}
                      disabled={!hasPhone(row.phone)}
                    >
                      <Phone 
                        className={`h-4 w-4 ${hasPhone(row.phone) 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                        }`}
                      />
                    </button>
                    <button
                      onClick={(e) => handleCopyEmail(e, row.email)}
                      title={hasEmail(row.email) ? 'Скопировать email' : 'Email не найден'}
                      aria-label={hasEmail(row.email) ? 'Скопировать email' : 'Email не найден'}
                      className={`cursor-pointer hover:opacity-80 transition-opacity ${!hasEmail(row.email) ? 'cursor-not-allowed opacity-50' : ''}`}
                      disabled={!hasEmail(row.email)}
                    >
                      <Mail 
                        className={`h-4 w-4 ${hasEmail(row.email) 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                        }`}
                      />
                    </button>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      row.status === 'error' 
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' 
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    }`}
                  >
                    {row.status === 'error' ? 'Ошибка' : 'OK'}
                  </span>
                </div>
              </div>

              {/* Score + Pages */}
              <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 mb-2">
                <span>Score: <span className="font-semibold text-gray-900 dark:text-white">{row.score}</span></span>
                <span>Pages: <span className="font-semibold text-gray-900 dark:text-white">{seo?.pagesCrawled || '-'}</span></span>
              </div>

              {/* Tech Badges */}
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                  seo?.robots === 'OK' 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' 
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                }`}>
                  R: {seo?.robots || '-'}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                  seo?.sitemap === 'OK' 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' 
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                }`}>
                  S: {seo?.sitemap || '-'}
                </span>
              </div>

              {/* Meta Summary */}
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                {metaSummary}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
                {actionRowState[row.id]?.state === 'loading' ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 flex-1" title="Идёт аудит…">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-saas-primary shrink-0" />
                    В работе
                  </span>
                ) : actionRowState[row.id]?.state === 'error' ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleCopy(row)} className="flex items-center justify-center gap-1 h-7 flex-1 text-xs">
                      {copiedId === row.id ? <Check className="h-3 w-3 text-green-600 dark:text-green-400" /> : <Copy className="h-3 w-3" />}
                      {copiedId === row.id ? 'Скопировано' : 'Copy'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.open(`https://${row.domain}`, '_blank')} className="flex items-center justify-center gap-1 h-7 flex-1 text-xs">
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                    <span className="inline-flex items-center text-red-600 dark:text-red-400" title={actionRowState[row.id]?.errorMessage || 'Ошибка аудита'}>
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    </span>
                    <Button variant="outline" size="sm" onClick={() => handleRunAudit(row)} className="flex items-center justify-center gap-1 h-7 flex-1 text-xs" title="Повторить">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggleRowDetails(row.id)} className="flex items-center justify-center gap-1 h-7 flex-1 text-xs">
                      {isExpanded ? 'Hide' : 'Details'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleCopy(row)} className="flex items-center justify-center gap-1 h-7 flex-1 text-xs">
                      {copiedId === row.id ? <Check className="h-3 w-3 text-green-600 dark:text-green-400" /> : <Copy className="h-3 w-3" />}
                      {copiedId === row.id ? 'Скопировано' : 'Copy'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.open(`https://${row.domain}`, '_blank')} className="flex items-center justify-center gap-1 h-7 flex-1 text-xs">
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                    {runId && (
                      <Button variant="outline" size="sm" onClick={() => handleRunAudit(row)} className="flex items-center justify-center gap-1 h-7 flex-1 text-xs" title="SEO-аудит">
                        <FileSearch className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => toggleRowDetails(row.id)} className="flex items-center justify-center gap-1 h-7 flex-1 text-xs">
                      {isExpanded ? 'Hide' : 'Details'}
                    </Button>
                  </>
                )}
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1.5 text-xs">
                  {row.titleFromSearch && (
                    <div className="pb-2 border-b border-gray-200 dark:border-gray-700">
                      <div className="text-gray-500 dark:text-gray-400 mb-1">Из поиска: заголовок</div>
                      <div className="text-gray-700 dark:text-gray-300">{row.titleFromSearch}</div>
                    </div>
                  )}
                  {row.snippetFromSearch && (
                    <div className="pb-2 border-b border-gray-200 dark:border-gray-700">
                      <div className="text-gray-500 dark:text-gray-400 mb-1">Из поиска: сниппет</div>
                      <div className="text-gray-600 dark:text-gray-400">{row.snippetFromSearch}</div>
                    </div>
                  )}
                  {row.urlFromSearch && (
                    <div className="pb-2 border-b border-gray-200 dark:border-gray-700">
                      <div className="text-gray-500 dark:text-gray-400 mb-1">Из поиска: URL</div>
                      <a href={row.urlFromSearch} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">{row.urlFromSearch}</a>
                    </div>
                  )}
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-0.5">Robots:</div>
                    <div className={seo?.robots === 'OK' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {seo?.robots || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-0.5">Sitemap:</div>
                    <div className={seo?.sitemap === 'OK' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {seo?.sitemap || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-0.5">Meta Title:</div>
                    <div className="text-gray-600 dark:text-gray-400">{seo?.metaTitle || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-0.5">Meta Desc:</div>
                    <div className="text-gray-600 dark:text-gray-400">{seo?.metaDesc || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-0.5">H1:</div>
                    <div className="text-gray-600 dark:text-gray-400">{seo?.h1 || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-0.5">Pages Crawled:</div>
                    <div className="text-gray-600 dark:text-gray-400">{seo?.pagesCrawled || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-0.5">Phone:</div>
                    <div className="text-gray-600 dark:text-gray-400">{row.phone || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-0.5">Email:</div>
                    <div className="text-gray-600 dark:text-gray-400">{row.email || '-'}</div>
                  </div>
                  {getTopIssues(row).length > 0 && (
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 mb-0.5">Top Issues:</div>
                      <div className="text-gray-600 dark:text-gray-400">{getTopIssues(row).join(' • ')}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-[12px] border border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Page Info */}
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Страница <span className="font-semibold">{currentPage}</span> из <span className="font-semibold">{totalPages}</span>
              {' '}(показано {startIndex + 1}-{Math.min(endIndex, totalResults)} из {totalResults})
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              {/* Previous Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Пред</span>
              </Button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((page, index) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${index}`} className="px-2 text-gray-500 dark:text-gray-400">
                        ...
                      </span>
                    );
                  }
                  const pageNum = page as number;
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      className="min-w-[36px] h-9"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              {/* Next Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1"
              >
                <span className="hidden sm:inline">След</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
