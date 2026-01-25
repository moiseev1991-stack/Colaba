'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink, Ban, Download, ChevronDown, ChevronUp, ChevronsUpDown, Check, X, MoreVertical, Phone, Mail, ChevronLeft, ChevronRight, FileSearch } from 'lucide-react';
import { Button } from './ui/button';
import { Select } from './ui/select';
import type { LeadRow } from '@/lib/types';
import { isBlacklisted, addToBlacklist, getResultsPageSize, setResultsPageSize } from '@/lib/storage';
import { exportToCSV, downloadCSV } from '@/lib/csv';
import { ToastContainer, type Toast } from './Toast';
import { runResultAudit } from '@/src/services/api/search';
import { addDomainToBlacklist as addDomainToBlacklistApi } from '@/src/services/api/blacklist';

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
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showMobileActions, setShowMobileActions] = useState(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [auditingResultId, setAuditingResultId] = useState<string | null>(null);
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

  // Scroll to top of table when page changes
  useEffect(() => {
    if (tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPage]);

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
    setAuditingResultId(row.id);
    try {
      await runResultAudit(parseInt(runId, 10), parseInt(row.id, 10));
      onAuditComplete?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast('error', err?.response?.data?.detail || 'Ошибка SEO-аудита');
    } finally {
      setAuditingResultId(null);
    }
  };

  const toggleRowDetails = (rowId: string) => {
    setExpandedRow(expandedRow === rowId ? null : rowId);
  };

  // Format Meta summary
  const formatMetaSummary = (seo?: LeadRow['seo']): string => {
    if (!seo) return '-';
    
    const parts: string[] = [];
    
    // Extract percentages from metaTitle
    const titleDupMatch = seo.metaTitle.match(/дублируется\s+(\d+)%/);
    if (titleDupMatch) {
      parts.push(`Title dup ${titleDupMatch[1]}%`);
    }
    
    // Extract from metaDesc
    const descEmptyMatch = seo.metaDesc.match(/не найден\s+(\d+)%/);
    if (descEmptyMatch) {
      parts.push(`Desc empty ${descEmptyMatch[1]}%`);
    }
    
    // Extract from h1
    const h1MissMatch = seo.h1.match(/не найден\s+(\d+)%/);
    if (h1MissMatch) {
      parts.push(`H1 miss ${h1MissMatch[1]}%`);
    }
    
    return parts.length > 0 ? parts.join(' • ') : '-';
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

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
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
  );

  return (
    <div className="space-y-4" ref={tableRef}>
      {/* Filters, Actions and View Mode */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Desktop Toolbar */}
        <div className="hidden md:flex items-center justify-between gap-4 px-4 py-3">
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
          
          <div className="flex items-center gap-4">
            {/* Page Size Selector */}
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
                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">Только с телефоном</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filterErrors}
                onChange={(e) => setFilterErrors(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">Ошибки</span>
            </label>
          </div>
          
          {/* Row 2: Page Size + Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Page Size Selector */}
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
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 min-w-[160px]">
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
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {viewMode === 'compact' ? (
                  <>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-40">
                      <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none" onClick={() => handleSort('domain')}>
                        Domain
                        {sortField === 'domain' ? (
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
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-16">
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
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '220px', minWidth: '220px' }}>
                      Tech
                    </th>
                    <th className="text-left px-2 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '100px', minWidth: '100px' }}>
                      Контакты
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" style={{ width: '340px', minWidth: '340px', maxWidth: '340px' }}>
                      Meta
                    </th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-20">
                      Pages
                    </th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-20">
                      Status
                    </th>
                    <th className="text-left px-2 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider w-24">
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
                  const metaSummary = formatMetaSummary(seo);
                  
                  return (
                    <>
                      <tr
                        key={row.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        style={{ height: '80px' }}
                      >
                        {viewMode === 'compact' ? (
                          <>
                            <td 
                              className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white cursor-pointer align-middle"
                              onClick={() => toggleRowDetails(row.id)}
                            >
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                )}
                                <span className="line-clamp-1 truncate">{row.domain}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white text-center align-middle">
                              {row.score}
                            </td>
                            <td className="px-3 py-2 align-middle" style={{ width: '220px' }}>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  {seo?.robots === 'OK' ? (
                                    <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : (
                                    <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                  )}
                                  <span className="text-xs">
                                    <span className="text-gray-500 dark:text-gray-400">Robots:</span>{' '}
                                    <span className="text-gray-700 dark:text-gray-300">{seo?.robots || '-'}</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {seo?.sitemap === 'OK' ? (
                                    <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : (
                                    <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                  )}
                                  <span className="text-xs">
                                    <span className="text-gray-500 dark:text-gray-400">Sitemap:</span>{' '}
                                    <span className="text-gray-700 dark:text-gray-300">{seo?.sitemap || '-'}</span>
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 align-middle" style={{ width: '100px' }}>
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
                            <td className="px-4 py-2 align-middle" style={{ width: '340px', maxWidth: '340px' }}>
                              <p 
                                className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 truncate"
                                title={metaSummary}
                              >
                                {metaSummary}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-center align-middle">
                              {seo?.pagesCrawled || '-'}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded ${
                                  row.status === 'error' 
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' 
                                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                }`}
                              >
                                {row.status === 'error' ? 'Ошибка' : 'OK'}
                              </span>
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(row);
                                  }}
                                  className="h-7 w-7"
                                  title="Копировать"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(`https://${row.domain}`, '_blank');
                                  }}
                                  className="h-7 w-7"
                                  title="Открыть"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                                {runId && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRunAudit(row);
                                    }}
                                    className="h-7 w-7"
                                    title="SEO-аудит"
                                    disabled={auditingResultId === row.id}
                                  >
                                    {auditingResultId === row.id ? (
                                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent block" />
                                    ) : (
                                      <FileSearch className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                {!blacklisted && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddToBlacklist(row.domain);
                                    }}
                                    className="h-7 w-7 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                                    title="Blacklist"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </Button>
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCopy(row)}
                                  className="h-7 w-7"
                                  title="Копировать"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => window.open(`https://${row.domain}`, '_blank')}
                                  className="h-7 w-7"
                                  title="Открыть"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                                {runId && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRunAudit(row)}
                                    className="h-7 w-7"
                                    title="SEO-аудит"
                                    disabled={auditingResultId === row.id}
                                  >
                                    {auditingResultId === row.id ? (
                                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent block" />
                                    ) : (
                                      <FileSearch className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                {!blacklisted && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleAddToBlacklist(row.domain)}
                                    className="h-7 w-7 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                                    title="Blacklist"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </Button>
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
          const blacklisted = isBlacklisted(row.domain);
          const seo = row.seo;
          const isExpanded = expandedRow === row.id;
          const metaSummary = formatMetaSummary(seo);
          
          return (
            <div
              key={row.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm"
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(row)}
                  className="flex items-center justify-center gap-1 h-7 flex-1 text-xs"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`https://${row.domain}`, '_blank')}
                  className="flex items-center justify-center gap-1 h-7 flex-1 text-xs"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </Button>
                {runId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRunAudit(row)}
                    className="flex items-center justify-center gap-1 h-7 flex-1 text-xs"
                    disabled={auditingResultId === row.id}
                    title="SEO-аудит"
                  >
                    {auditingResultId === row.id ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <FileSearch className="h-3 w-3" />
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleRowDetails(row.id)}
                  className="flex items-center justify-center gap-1 h-7 flex-1 text-xs"
                >
                  {isExpanded ? 'Hide' : 'Details'}
                </Button>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1.5 text-xs">
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
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
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
