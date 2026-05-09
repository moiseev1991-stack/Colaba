'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Copy,
  ExternalLink,
  Ban,
  Send,
  Phone,
  Mail,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search as SearchIcon,
  X,
} from 'lucide-react';
import type { LeadRow, SiteType } from '@/lib/types';
import { addDomainToBlacklist as addDomainToBlacklistApi } from '@/src/services/api/blacklist';
import { exportToCSV, downloadCSV } from '@/lib/csv';
import { ToastContainer, type Toast } from './Toast';
import { cn } from '@/lib/utils';
import { ProposalSendModal } from './ProposalSendModal';
import type { LeadValues } from '@/lib/proposalTemplates';

interface LeadsResultsTableProps {
  results: LeadRow[];
  runId?: string;
}

const PAGE_SIZE = 25;

type SortKey = 'idx' | 'company' | 'phone' | 'email' | 'status' | 'type' | 'tg' | 'vk';
type SortOrder = 'asc' | 'desc';

// Visual config for the «тип» column. Order in this map also drives sort order:
// company first, junk later. Values are ASCII-friendly so they're stable across locales.
const SITE_TYPE_META: Record<SiteType, { label: string; tint: string; sortRank: number }> = {
  company: { label: 'фирма',     tint: 'hsl(var(--success))',          sortRank: 0 },
  market:  { label: 'маркет',    tint: '#F59E0B',                       sortRank: 1 },
  catalog: { label: 'каталог',   tint: '#A78BFA',                       sortRank: 2 },
  social:  { label: 'соцсеть',   tint: '#26A5E4',                       sortRank: 3 },
  news:    { label: 'новости',   tint: '#94A3B8',                       sortRank: 4 },
  gov:     { label: 'госорган',  tint: '#64748B',                       sortRank: 5 },
  broken:  { label: 'битый',     tint: 'hsl(var(--danger))',           sortRank: 6 },
  unknown: { label: '?',         tint: 'hsl(var(--muted))',            sortRank: 7 },
};

function statusLabel(s: LeadRow['status']): string {
  if (s === 'ok') return 'готово';
  if (s === 'error') return 'ошибка';
  return 'в работе';
}
function statusBadgeClass(s: LeadRow['status']): string {
  if (s === 'ok') return 'app-badge app-badge-success';
  if (s === 'error') return 'app-badge app-badge-danger';
  return 'app-badge app-badge-warning';
}

/** Heuristic messenger detection from already-fetched text fields. We pull out
 *  the actual handle when we can (e.g. `t.me/foobar` → `foobar`) so the cell
 *  can show both "yes there's Telegram" and a clickable link. Server-side
 *  extraction will replace this once the crawler writes structured data. */
interface Messengers {
  tg: { has: boolean; handle: string | null; url: string | null };
  vk: { has: boolean; handle: string | null; url: string | null };
}

function detectMessengers(r: LeadRow): Messengers {
  const haystack = [
    r.siteMetaDescription,
    r.sitePageTitle,
    r.snippetFromSearch,
    r.titleFromSearch,
    r.outreachText,
    r.urlFromSearch,
  ]
    .filter(Boolean)
    .join(' ');

  // Telegram: t.me/<handle>, telegram.me/<handle>, @<handle> standalone.
  // Username spec: 5–32 chars [a-zA-Z0-9_], can't start with digit.
  const tgUrl = haystack.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z][\w]{4,31})/i);
  const tgAt = !tgUrl ? haystack.match(/(?:^|\s|>)@([a-zA-Z][\w]{4,31})\b/) : null;
  let tgHandle: string | null = null;
  let tgUrlStr: string | null = null;
  if (tgUrl?.[1]) {
    tgHandle = tgUrl[1];
    tgUrlStr = `https://t.me/${tgHandle}`;
  } else if (tgAt?.[1]) {
    tgHandle = tgAt[1];
    tgUrlStr = `https://t.me/${tgHandle}`;
  } else if (/\btelegram\b/i.test(haystack)) {
    // Mentioned but no link — keep the indicator but no clickable handle.
    tgHandle = null;
    tgUrlStr = null;
  }

  // VK: vk.com/<handle> — handle can be id12345, club12345, or a vanity name.
  const vkMatch = haystack.match(/(?:https?:\/\/)?(?:m\.)?vk\.com\/([\w.\-]{2,64})/i);
  let vkHandle: string | null = null;
  let vkUrlStr: string | null = null;
  if (vkMatch?.[1]) {
    vkHandle = vkMatch[1];
    vkUrlStr = `https://vk.com/${vkHandle}`;
  } else if (/\bвконтакте\b/i.test(haystack)) {
    vkHandle = null;
    vkUrlStr = null;
  }

  return {
    tg: { has: Boolean(tgHandle) || /\btelegram\b/i.test(haystack), handle: tgHandle, url: tgUrlStr },
    vk: { has: Boolean(vkHandle) || /\bвконтакте\b/i.test(haystack), handle: vkHandle, url: vkUrlStr },
  };
}

export function LeadsResultsTable({ results, runId: _runId }: LeadsResultsTableProps) {
  const [filterPhoneOnly, setFilterPhoneOnly] = useState(false);
  const [filterEmailOnly, setFilterEmailOnly] = useState(false);
  const [filterTgOnly, setFilterTgOnly] = useState(false);
  const [filterVkOnly, setFilterVkOnly] = useState(false);
  const [hideErrors, setHideErrors] = useState(false);
  // Default ON: most cold-outreach users only want real companies, not catalogs
  // or social pages. They can flip this off to inspect everything.
  const [companiesOnly, setCompaniesOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('idx');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [proposalModal, setProposalModal] = useState<{ open: boolean; leads: LeadValues[] }>({
    open: false,
    leads: [],
  });

  const addToast = useCallback((type: Toast['type'], message: string) => {
    setToasts((p) => [...p, { id: Date.now().toString() + Math.random(), type, message }]);
  }, []);

  // Decorate each row with derived fields used both in the UI and for sorting.
  const decorated = useMemo(() => {
    return results.map((r, originalIdx) => {
      const company =
        (r.titleFromSearch ?? r.sitePageTitle ?? '')
          .replace(/\s+[|—–-]\s+.*$/, '')
          .trim() || r.domain;
      // Prefer the backend-cleaned description; the raw fields stay as graceful fallbacks
      // for old rows that ran before the classifier shipped.
      const description =
        r.cleanDescription || r.siteMetaDescription || r.sitePageTitle || r.snippetFromSearch || '';
      const messengers = detectMessengers(r);
      const siteType: SiteType = r.siteType ?? 'unknown';
      return { row: r, originalIdx, company, description, messengers, siteType };
    });
  }, [results]);

  // Filtering
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return decorated.filter(({ row, company, description, siteType, messengers }) => {
      if (filterPhoneOnly && !row.phone) return false;
      if (filterEmailOnly && !row.email) return false;
      if (filterTgOnly && !messengers.tg.has) return false;
      if (filterVkOnly && !messengers.vk.has) return false;
      if (hideErrors && row.status === 'error') return false;
      // "Only companies" hides everything that's clearly not a company site.
      // unknown stays visible because we'd rather leak a real lead than hide one.
      if (companiesOnly && siteType !== 'company' && siteType !== 'unknown') return false;
      if (q) {
        const hay = `${row.domain} ${company} ${description} ${row.phone ?? ''} ${row.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [decorated, filterPhoneOnly, filterEmailOnly, filterTgOnly, filterVkOnly, hideErrors, companiesOnly, searchQuery]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortOrder === 'asc' ? 1 : -1;
    const statusRank = { ok: 0, processing: 1, error: 2 } as const;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'company':
          return a.company.localeCompare(b.company, 'ru') * dir;
        case 'phone': {
          const av = a.row.phone ? 0 : 1;
          const bv = b.row.phone ? 0 : 1;
          return (av - bv) * dir;
        }
        case 'email': {
          const av = a.row.email ? 0 : 1;
          const bv = b.row.email ? 0 : 1;
          return (av - bv) * dir;
        }
        case 'tg': {
          const av = a.messengers.tg.has ? 0 : 1;
          const bv = b.messengers.tg.has ? 0 : 1;
          return (av - bv) * dir;
        }
        case 'vk': {
          const av = a.messengers.vk.has ? 0 : 1;
          const bv = b.messengers.vk.has ? 0 : 1;
          return (av - bv) * dir;
        }
        case 'status':
          return (statusRank[a.row.status] - statusRank[b.row.status]) * dir;
        case 'type':
          return (SITE_TYPE_META[a.siteType].sortRank - SITE_TYPE_META[b.siteType].sortRank) * dir;
        case 'idx':
        default:
          return (a.originalIdx - b.originalIdx) * dir;
      }
    });
    return arr;
  }, [filtered, sortKey, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every(({ row }) => next.has(row.id));
      if (allSelected) pageItems.forEach(({ row }) => next.delete(row.id));
      else pageItems.forEach(({ row }) => next.add(row.id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast('success', `${label} скопирован`);
    } catch {
      addToast('error', 'Не удалось скопировать');
    }
  };

  const blacklistDomain = async (domain: string) => {
    try {
      await addDomainToBlacklistApi(domain);
      addToast('success', `${domain} → блеклист`);
    } catch {
      addToast('error', 'Не удалось добавить в блеклист');
    }
  };

  const buildLeadValues = useCallback(
    (rows: LeadRow[]): LeadValues[] =>
      rows.map((r) => {
        const company =
          (r.titleFromSearch ?? r.sitePageTitle ?? '')
            .replace(/\s+[|—–-]\s+.*$/, '')
            .trim() || r.domain;
        return {
          company,
          domain: r.domain,
          contact: r.email || r.phone || null,
        };
      }),
    [],
  );

  const openSendModalForLead = (r: LeadRow) => {
    setProposalModal({ open: true, leads: buildLeadValues([r]) });
  };

  const openSendModalForSelected = () => {
    const rows =
      selectedIds.size > 0
        ? results.filter((r) => selectedIds.has(r.id))
        : sorted.map((d) => d.row);
    if (rows.length === 0) {
      addToast('error', 'Выберите хотя бы один лид');
      return;
    }
    setProposalModal({ open: true, leads: buildLeadValues(rows) });
  };

  const exportSelected = () => {
    const rows = selectedIds.size > 0 ? results.filter((r) => selectedIds.has(r.id)) : sorted.map((d) => d.row);
    if (rows.length === 0) {
      addToast('error', 'Нет данных для экспорта');
      return;
    }
    const csv = exportToCSV(
      rows.map((r) => ({
        domain: r.domain,
        type: r.siteType ?? '',
        title: r.titleFromSearch ?? '',
        description: r.cleanDescription ?? r.siteMetaDescription ?? r.sitePageTitle ?? r.snippetFromSearch ?? '',
        phone: r.phone ?? '',
        email: r.email ?? '',
        status: r.status,
      })),
    );
    downloadCSV(csv, `leads_${Date.now()}.csv`);
  };

  const counts = useMemo(() => {
    return {
      withPhone: results.filter((r) => r.phone).length,
      withEmail: results.filter((r) => r.email).length,
      done: results.filter((r) => r.status === 'ok').length,
      processing: results.filter((r) => r.status === 'processing').length,
      // company + unknown count as "good to keep" for the toggle counter.
      companies: results.filter(
        (r) => !r.siteType || r.siteType === 'company' || r.siteType === 'unknown',
      ).length,
      withTg: decorated.filter((d) => d.messengers.tg.has).length,
      withVk: decorated.filter((d) => d.messengers.vk.has).length,
    };
  }, [results, decorated]);

  const allOnPageSelected = pageItems.length > 0 && pageItems.every(({ row }) => selectedIds.has(row.id));

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-3 mb-3 px-4 py-3"
        style={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
      >
        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 h-9 flex-1 min-w-[200px] max-w-[360px]"
          style={{
            background: 'hsl(var(--surface-2) / 0.5)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 4,
          }}
        >
          <SearchIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'hsl(var(--muted))' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Найти по компании, домену, контакту…"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-50"
            style={{ color: 'hsl(var(--text))' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5"
              style={{ color: 'hsl(var(--muted))' }}
              aria-label="Очистить"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <FilterToggle checked={companiesOnly} onChange={setCompaniesOnly} label="только компании" count={counts.companies} />
          <FilterToggle checked={filterPhoneOnly} onChange={setFilterPhoneOnly} label="с телефоном" count={counts.withPhone} />
          <FilterToggle checked={filterEmailOnly} onChange={setFilterEmailOnly} label="с email" count={counts.withEmail} />
          <FilterToggle checked={filterTgOnly} onChange={setFilterTgOnly} label="с Telegram" count={counts.withTg} />
          <FilterToggle checked={filterVkOnly} onChange={setFilterVkOnly} label="с VK" count={counts.withVk} />
          <FilterToggle checked={hideErrors} onChange={setHideErrors} label="скрыть ошибки" />
        </div>

        <div className="flex items-center gap-3 app-mono-label ml-auto" style={{ color: 'hsl(var(--muted))' }}>
          <span>
            показано <span style={{ color: 'hsl(var(--text))', fontWeight: 700 }}>{sorted.length}</span> из {results.length}
          </span>
          {counts.processing > 0 && (
            <span style={{ color: 'hsl(var(--warning))' }}>
              · {counts.processing} в работе
            </span>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between gap-3 mb-3 px-4 py-3"
          style={{
            background: 'hsl(var(--accent-weak))',
            border: '1px solid hsl(var(--accent) / 0.4)',
            borderRadius: 6,
          }}
        >
          <div className="flex items-center gap-3">
            <span className="app-mono-label" style={{ color: 'hsl(var(--accent))' }}>
              выбрано: {selectedIds.size}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="app-mono-label hover:underline"
              style={{ color: 'hsl(var(--muted))' }}
            >
              сбросить
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportSelected}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold border transition-colors hover:bg-[hsl(var(--surface))]"
              style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))', borderRadius: 4, color: 'hsl(var(--text))' }}
            >
              <Copy className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              onClick={openSendModalForSelected}
              className="app-cta-mega"
              style={{ height: 36, padding: '0 16px', fontSize: 13 }}
            >
              <Send className="h-4 w-4" /> Отправить КП
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className="overflow-hidden"
        style={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 200 }} />
              <col />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead style={{ background: 'hsl(var(--surface-2) / 0.6)', borderBottom: '1px solid hsl(var(--border))' }}>
              <tr>
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    className="w-4 h-4"
                    style={{ accentColor: 'hsl(var(--accent))' }}
                    aria-label="выбрать всё на странице"
                  />
                </th>
                <SortableTh sortKey="idx" current={sortKey} order={sortOrder} onClick={toggleSort}>#</SortableTh>
                <SortableTh sortKey="type" current={sortKey} order={sortOrder} onClick={toggleSort}>тип</SortableTh>
                <SortableTh sortKey="company" current={sortKey} order={sortOrder} onClick={toggleSort}>компания</SortableTh>
                <Th>о компании</Th>
                <SortableTh sortKey="tg" current={sortKey} order={sortOrder} onClick={toggleSort}>TG</SortableTh>
                <SortableTh sortKey="vk" current={sortKey} order={sortOrder} onClick={toggleSort}>VK</SortableTh>
                <SortableTh sortKey="phone" current={sortKey} order={sortOrder} onClick={toggleSort}>телефон</SortableTh>
                <SortableTh sortKey="email" current={sortKey} order={sortOrder} onClick={toggleSort}>email</SortableTh>
                <SortableTh sortKey="status" current={sortKey} order={sortOrder} onClick={toggleSort}>статус</SortableTh>
                <Th align="right">действия</Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-[14px]" style={{ color: 'hsl(var(--muted))' }}>
                    Нет результатов под выбранные фильтры
                  </td>
                </tr>
              )}
              {pageItems.map(({ row: r, company, description, messengers, siteType }, idx) => {
                const globalIdx = pageStart + idx + 1;
                const checked = selectedIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className="border-b last:border-b-0 transition-colors"
                    style={{ borderColor: 'hsl(var(--border))', background: checked ? 'hsl(var(--accent-weak))' : undefined }}
                  >
                    <td className="px-3 py-3 align-middle">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleId(r.id)}
                        className="w-4 h-4"
                        style={{ accentColor: 'hsl(var(--accent))' }}
                        aria-label={`выбрать ${r.domain}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                        {String(globalIdx).padStart(3, '0')}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <SiteTypeBadge type={siteType} />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div
                        className="text-[14px] font-bold leading-tight truncate"
                        style={{ color: 'hsl(var(--text))' }}
                        title={`${company} (${r.domain})`}
                      >
                        {company}
                      </div>
                      <div
                        className="app-mono-label mt-0.5 truncate"
                        style={{ color: 'hsl(var(--muted))', opacity: 0.7 }}
                        title={r.domain}
                      >
                        {r.domain}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div
                        className="text-[13px] leading-snug truncate"
                        style={{ color: 'hsl(var(--text) / 0.85)' }}
                        title={description}
                      >
                        {description || <span style={{ color: 'hsl(var(--muted))' }}>—</span>}
                      </div>
                      {r.keywordHits && r.keywordHits.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.keywordHits.map((kw) => (
                            <span
                              key={kw}
                              className="inline-flex items-center px-1.5 h-4 text-[10px] font-semibold"
                              style={{
                                background: 'hsl(var(--success) / 0.15)',
                                color: 'hsl(var(--success))',
                                border: '1px solid hsl(var(--success) / 0.4)',
                                borderRadius: 3,
                                letterSpacing: '0.02em',
                              }}
                              title={`Слово найдено на сайте: ${kw}`}
                            >
                              ✓ {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <MessengerCell
                        kind="tg"
                        has={messengers.tg.has}
                        handle={messengers.tg.handle}
                        url={messengers.tg.url}
                        status={r.status}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <MessengerCell
                        kind="vk"
                        has={messengers.vk.has}
                        handle={messengers.vk.handle}
                        url={messengers.vk.url}
                        status={r.status}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {r.phone ? (
                        <ContactCell value={r.phone} icon={<Phone className="h-3.5 w-3.5" />} href={`tel:${r.phone}`} onCopy={() => copyValue(r.phone!, 'Телефон')} />
                      ) : (
                        <Empty status={r.status} />
                      )}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {r.email ? (
                        <ContactCell value={r.email} icon={<Mail className="h-3.5 w-3.5" />} href={`mailto:${r.email}`} onCopy={() => copyValue(r.email!, 'Email')} />
                      ) : (
                        <Empty status={r.status} />
                      )}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className={statusBadgeClass(r.status)}>
                        {r.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
                        {r.status === 'error' && <AlertCircle className="h-3 w-3" />}
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Открыть сайт" onClick={() => window.open(`https://${r.domain}`, '_blank', 'noopener')}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title="Подготовить КП"
                          onClick={() => openSendModalForLead(r)}
                          accent
                        >
                          <Send className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="В блеклист" onClick={() => blacklistDomain(r.domain)}>
                          <Ban className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--surface-2) / 0.4)' }}
          >
            <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
              стр. {safePage} из {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <PageBtn disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </PageBtn>
              <PageBtn disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </PageBtn>
            </div>
          </div>
        )}
      </div>

      <ProposalSendModal
        open={proposalModal.open}
        leads={proposalModal.leads}
        onClose={() => setProposalModal({ open: false, leads: [] })}
        onConfirm={() => {
          // Frontend stub — real campaign API hook lands later. We give the
          // user clear feedback that the action was understood.
          addToast(
            'success',
            `Кампания подготовлена: ${proposalModal.leads.length} ${proposalModal.leads.length === 1 ? 'отправление' : 'отправлений'} (отправка появится после подключения бэка)`,
          );
        }}
      />

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className="px-3 py-3 app-mono-label"
      style={{
        textAlign: align ?? 'left',
        color: 'hsl(var(--muted))',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function SortableTh({
  sortKey,
  current,
  order,
  onClick,
  children,
}: {
  sortKey: SortKey;
  current: SortKey;
  order: SortOrder;
  onClick: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = current === sortKey;
  return (
    <th className="px-3 py-3" style={{ whiteSpace: 'nowrap' }}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className="inline-flex items-center gap-1 app-mono-label transition-colors hover:text-[hsl(var(--accent))] cursor-pointer"
        style={{ color: active ? 'hsl(var(--accent))' : 'hsl(var(--muted))' }}
      >
        {children}
        {active ? (
          order === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function FilterToggle({ checked, onChange, label, count }: { checked: boolean; onChange: (v: boolean) => void; label: string; count?: number }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4"
        style={{ accentColor: 'hsl(var(--accent))' }}
      />
      <span className="text-[13px]" style={{ color: 'hsl(var(--text))' }}>
        {label}
      </span>
      {typeof count === 'number' && (
        <span className="app-bracket-tag" style={{ color: 'hsl(var(--muted))' }}>
          {count}
        </span>
      )}
    </label>
  );
}

function MessengerCell({
  kind,
  has,
  handle,
  url,
  status,
}: {
  kind: 'tg' | 'vk';
  has: boolean;
  handle: string | null;
  url: string | null;
  status: LeadRow['status'];
}) {
  if (!has) return <Empty status={status} />;

  const meta =
    kind === 'tg'
      ? { label: 'Telegram', color: '#26A5E4', short: 'TG' }
      : { label: 'VK', color: '#0077FF', short: 'VK' };

  // Indicator: a colored "TG" / "VK" pill. Click-through to the actual handle
  // when we extracted one; otherwise just a static "yes, mentioned" badge.
  const pill = (
    <span
      className="inline-flex items-center justify-center h-6 px-2 text-[11px] font-bold whitespace-nowrap"
      style={{
        background: `${meta.color}22`,
        color: meta.color,
        border: `1px solid ${meta.color}55`,
        borderRadius: 3,
        letterSpacing: '0.04em',
      }}
      title={handle ? `${meta.label}: ${handle}` : `${meta.label} упомянут на сайте`}
    >
      {meta.short}
    </span>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Открыть ${meta.label}: ${handle ?? ''}`}
      >
        {pill}
      </a>
    );
  }
  return pill;
}

function ContactCell({ value, icon, href, onCopy }: { value: string; icon: React.ReactNode; href: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <a
        href={href}
        className="flex items-center gap-1.5 text-[13px] font-medium truncate hover:underline"
        style={{ color: 'hsl(var(--text))' }}
        title={value}
      >
        <span style={{ color: 'hsl(var(--accent))' }}>{icon}</span>
        <span className="truncate">{value}</span>
      </a>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 inline-flex items-center justify-center w-6 h-6 hover:bg-[hsl(var(--accent-weak))] transition-colors"
        style={{ borderRadius: 3, color: 'hsl(var(--muted))' }}
        title="Копировать"
        aria-label="Копировать"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

function Empty({ status }: { status: LeadRow['status'] }) {
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1.5 app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
        <Loader2 className="h-3 w-3 animate-spin" /> сбор…
      </span>
    );
  }
  return <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>—</span>;
}

function IconBtn({
  children,
  title,
  onClick,
  accent,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center w-7 h-7 transition-colors"
      style={{
        borderRadius: 3,
        color: accent ? 'hsl(var(--accent))' : 'hsl(var(--muted))',
        background: accent ? 'hsl(var(--accent-weak))' : undefined,
        border: accent ? '1px solid hsl(var(--accent) / 0.3)' : undefined,
      }}
      onMouseEnter={(e) => {
        if (!accent) (e.currentTarget.style.background = 'hsl(var(--accent-weak))');
      }}
      onMouseLeave={(e) => {
        if (!accent) (e.currentTarget.style.background = '');
      }}
    >
      {children}
    </button>
  );
}

function SiteTypeBadge({ type }: { type: SiteType }) {
  const meta = SITE_TYPE_META[type];
  return (
    <span
      title={`Тип сайта: ${meta.label}`}
      className="inline-flex items-center px-2 h-6 app-mono-label whitespace-nowrap"
      style={{
        background: `${meta.tint}1A`,
        color: meta.tint,
        border: `1px solid ${meta.tint}55`,
        borderRadius: 3,
        fontSize: 11,
        letterSpacing: '0.04em',
      }}
    >
      {meta.label}
    </span>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center w-8 h-8 transition-colors',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[hsl(var(--accent-weak))] cursor-pointer',
      )}
      style={{ borderRadius: 3, color: 'hsl(var(--text))' }}
    >
      {children}
    </button>
  );
}
