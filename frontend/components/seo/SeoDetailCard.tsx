'use client';

import { useState, useCallback } from 'react';
import { Phone, Mail, ExternalLink, Link2, Copy, Check } from 'lucide-react';
import type { LeadRow, SEOData } from '@/lib/types';

// ─── EmptyValue: единый fallback для пустых полей ─────────────────────────
function EmptyValue() {
  return (
    <span className="text-slate-400 dark:text-slate-500 text-sm font-medium tabular-nums">
      — нет данных
    </span>
  );
}

// ─── InfoBadge: badges источника и статуса ─────────────────────────────────
function InfoBadge({
  label,
  variant = 'neutral',
}: {
  label: string;
  variant?: 'source' | 'ok' | 'warn' | 'error' | 'neutral';
}) {
  const base = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium';
  const variants = {
    source:
      'bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300 border border-blue-400/20 dark:border-blue-500/25',
    ok: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300 border border-emerald-400/20 dark:border-emerald-500/25',
    warn: 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300 border border-amber-400/20 dark:border-amber-500/25',
    error: 'bg-red-500/10 text-red-700 dark:bg-red-400/15 dark:text-red-300 border border-red-400/20 dark:border-red-500/25',
    neutral: 'bg-slate-500/10 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300 border border-slate-400/20 dark:border-slate-500/25',
  };
  return <span className={`${base} ${variants[variant]}`}>{label}</span>;
}

// ─── UrlPill: компактный URL с иконкой и кнопкой открыть ───────────────────
function UrlPill({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-1.5 min-w-0 rounded-md px-2 py-1.5 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-600/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/60 transition-colors duration-150"
      title={url}
    >
      <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
      <span className="text-sm text-blue-600 dark:text-blue-400 truncate flex-1 min-w-0">
        {url.replace(/^https?:\/\//, '')}
      </span>
      <ExternalLink className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100" />
    </a>
  );
}

// ─── DetailHeader: компактный smart-header ──────────────────────────────────
function DetailHeader({
  row,
  displayUrl,
  statusLabel,
  statusVariant,
  compact = false,
}: {
  row: LeadRow;
  displayUrl: string | null;
  statusLabel: string;
  statusVariant: 'ok' | 'warn' | 'error';
  compact?: boolean;
}) {
  const title = row.titleFromSearch?.trim() || '';
  const snippet = row.snippetFromSearch?.trim() || '';

  return (
    <header className={`border-b border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      {/* Badges row */}
      <div className={`flex items-center gap-1.5 flex-wrap ${compact ? 'mb-1' : 'mb-2'}`}>
        {!compact && <InfoBadge label="Источник из поиска" variant="source" />}
        <InfoBadge label={statusLabel} variant={statusVariant} />
      </div>

      {/* Hero content */}
      <div className={compact ? 'space-y-0.5' : 'space-y-1.5'}>
        <h3
          className={`font-semibold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 ${compact ? 'text-[13px]' : 'text-base'}`}
          title={title || undefined}
        >
          {title || <EmptyValue />}
        </h3>
        {snippet && (
          <p
            className={`text-slate-600 dark:text-slate-300 leading-snug line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}
            title={snippet}
          >
            {snippet}
          </p>
        )}
        <div className="pt-0.5">
          {displayUrl ? (
            <UrlPill url={displayUrl} />
          ) : (
            <div className="rounded-md px-2 py-1.5 bg-slate-100/60 dark:bg-slate-800/40">
              <EmptyValue />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── DataCard: универсальная data card с опциональной иконкой статуса ───────
function DataCard({
  label,
  value,
  status = 'neutral',
  lineClamp = false,
}: {
  label: string;
  value: string | number | undefined;
  status?: 'ok' | 'warn' | 'neutral';
  lineClamp?: boolean;
}) {
  const isEmpty = value == null || value === '' || value === '-';
  const displayValue = isEmpty ? null : String(value);

  const valueColor =
    status === 'ok'
      ? 'text-emerald-700 dark:text-emerald-400'
      : status === 'warn'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-slate-800 dark:text-slate-200';

  return (
    <div className="group rounded-lg border border-slate-200/80 dark:border-slate-600/80 bg-white dark:bg-slate-800/50 px-2.5 py-2 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-all duration-150">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </span>
      <div
        className={`mt-0.5 text-sm font-semibold ${valueColor} ${lineClamp ? 'line-clamp-2' : 'truncate'}`}
        title={displayValue ?? undefined}
      >
        {displayValue ?? <EmptyValue />}
      </div>
    </div>
  );
}

// ─── ContactActionCard: action card с copy + open ───────────────────────────
function ContactActionCard({
  type,
  value,
  href,
}: {
  type: 'phone' | 'email';
  value: string;
  href: string;
}) {
  const [copied, setCopied] = useState(false);
  const isEmpty = !value || value.trim() === '' || value === '-';

  const Icon = type === 'phone' ? Phone : Mail;
  const label = type === 'phone' ? 'Телефон' : 'Email';
  const copyAria = type === 'phone' ? 'Скопировать телефон' : 'Скопировать email';
  const openAria = type === 'phone' ? 'Позвонить' : 'Открыть почту';

  const iconColor =
    type === 'phone'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-blue-600 dark:text-blue-400';

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isEmpty) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        setCopied(false);
      }
    },
    [value, isEmpty]
  );

  const btnBase =
    'inline-flex items-center justify-center rounded-md p-1.5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 focus-visible:ring-offset-1';

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-slate-200/80 dark:border-slate-600/80 bg-white dark:bg-slate-800/50 px-2.5 py-2 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-all duration-150 ${
        isEmpty ? 'opacity-90' : ''
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconColor} mt-0.5`} />
      <div className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </span>
        <span
          className={`block mt-0.5 text-base font-semibold truncate ${isEmpty ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}
          title={!isEmpty ? value : undefined}
        >
          {isEmpty ? 'Нет данных' : value}
        </span>
      </div>
      {!isEmpty && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className={`${btnBase} ${
              copied
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            aria-label={copied ? 'Скопировано' : copyAria}
            title={copied ? 'Скопировано' : 'Копировать'}
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
          </button>
          <a
            href={href}
            className={`${btnBase} text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200`}
            aria-label={openAria}
            title={type === 'phone' ? 'Позвонить' : 'Открыть почту'}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

function ensureAbsoluteUrl(url: string | null | undefined): string | null {
  if (!url || url.trim() === '') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

export interface SeoDetailCardProps {
  row: LeadRow;
  seo: SEOData | undefined;
  topIssues: string[];
  compact?: boolean;
}

export function SeoDetailCard({ row, seo, topIssues, compact = false }: SeoDetailCardProps) {
  const hasSearchData =
    Boolean(row.titleFromSearch?.trim()) ||
    Boolean(row.snippetFromSearch?.trim()) ||
    Boolean(row.urlFromSearch?.trim());

  const displayUrl = (ensureAbsoluteUrl(row.urlFromSearch) || row.urlFromSearch) ?? null;
  const statusLabel =
    row.status === 'error'
      ? 'Ошибка'
      : row.status === 'processing'
        ? 'В работе'
        : hasSearchData && row.seo
          ? 'Найден в SERP / OK'
          : hasSearchData
            ? 'Найден в SERP'
            : 'OK';

  const statusVariant =
    row.status === 'error' ? 'error' : row.status === 'processing' ? 'warn' : 'ok';

  return (
    <div
      className={`min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-slate-200/90 dark:border-slate-600/90 bg-white dark:bg-slate-900/95 shadow-sm transition-all duration-200 ${
        compact ? 'mt-1.5' : 'mt-2'
      }`}
    >
      <DetailHeader
        row={row}
        displayUrl={displayUrl}
        statusLabel={statusLabel}
        statusVariant={statusVariant}
        compact={compact}
      />

      {/* Dense grid: единая система data cards */}
      <div className={compact ? 'p-2' : 'p-3'}>
        <div className={`grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${compact ? 'sm:grid-cols-2' : ''}`}>
          <DataCard
            label="Robots"
            value={seo?.robots}
            status={!seo ? 'neutral' : seo.robots === 'OK' ? 'ok' : 'warn'}
          />
          <DataCard
            label="Sitemap"
            value={seo?.sitemap}
            status={!seo ? 'neutral' : seo.sitemap === 'OK' ? 'ok' : 'warn'}
          />
          <DataCard label="Pages Crawled" value={seo?.pagesCrawled} />
          <DataCard label="Meta Title" value={seo?.metaTitle} lineClamp />
          <DataCard label="Meta Description" value={seo?.metaDesc} lineClamp />
          <DataCard label="H1" value={seo?.h1} lineClamp />
          <ContactActionCard
            type="phone"
            value={row.phone || ''}
            href={row.phone ? `tel:${row.phone.replace(/\s/g, '')}` : '#'}
          />
          <ContactActionCard
            type="email"
            value={row.email || ''}
            href={row.email ? `mailto:${row.email}` : '#'}
          />
        </div>

        {topIssues.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
            <div className="flex flex-wrap gap-1.5">
              {topIssues.map((issue, i) => (
                <InfoBadge key={i} label={issue} variant="warn" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
