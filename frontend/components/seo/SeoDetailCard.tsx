'use client';

import { Phone, Mail } from 'lucide-react';
import type { LeadRow, SEOData } from '@/lib/types';

/** Пустое значение — компактный muted badge */
function EmptyValue() {
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
      Нет данных
    </span>
  );
}

/** Маленький status badge — второстепенный, компактный */
function CompactBadge({
  label,
  variant = 'neutral',
}: {
  label: string;
  variant?: 'ok' | 'warn' | 'error' | 'neutral';
}) {
  const classes =
    variant === 'ok'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      : variant === 'warn'
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
        : variant === 'error'
          ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
          : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20';

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${classes}`}
    >
      {label}
    </span>
  );
}

/** Компактная строка: label + value */
function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  const isEmpty = !value || value.trim() === '' || value === '-';
  return (
    <div className="flex items-start gap-1.5 min-w-0 py-0.5">
      <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500 w-16">{label}</span>
      <span className="min-w-0 flex-1 text-[12px] text-slate-700 dark:text-slate-300 truncate">
        {children ?? (isEmpty ? <EmptyValue /> : value)}
      </span>
    </div>
  );
}

/** Мини-карточка для одной метрики (Robots, Meta Title и т.д.) */
function MiniStatCard({
  label,
  value,
  status = 'neutral',
}: {
  label: string;
  value: string | number | undefined;
  status?: 'ok' | 'warn' | 'neutral';
}) {
  const isEmpty = value == null || value === '' || value === '-';
  const displayValue = isEmpty ? null : String(value);

  const badgeClass =
    status === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-600 dark:text-slate-400';

  return (
    <div className="rounded border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 px-2 py-1.5 min-h-[28px] flex flex-col justify-center">
      <span className="text-[10px] text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`text-[11px] font-medium truncate ${badgeClass}`}>
        {displayValue ?? <EmptyValue />}
      </span>
    </div>
  );
}

/** Компактный контакт: иконка + значение в одну строку */
function CompactContact({
  type,
  value,
  href,
}: {
  type: 'phone' | 'email';
  value: string;
  href: string;
}) {
  const isEmpty = !value || value.trim() === '' || value === '-';
  const Icon = type === 'phone' ? Phone : Mail;
  const label = type === 'phone' ? 'Телефон' : 'Email';

  const iconClass =
    type === 'phone'
      ? 'text-emerald-500 dark:text-emerald-400'
      : 'text-blue-500 dark:text-blue-400';

  const content = (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className={`h-3 w-3 shrink-0 ${iconClass}`} />
      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{label}</span>
      <span className="text-[11px] truncate min-w-0">
        {isEmpty ? <EmptyValue /> : value}
      </span>
    </div>
  );

  if (isEmpty) {
    return (
      <div className="rounded border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 px-2 py-1.5 min-h-[28px] flex items-center">
        {content}
      </div>
    );
  }

  return (
    <a
      href={href}
      className="rounded border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 px-2 py-1.5 min-h-[28px] flex items-center hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
    >
      {content}
    </a>
  );
}

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
  /** Compact layout для мобильных карточек */
  compact?: boolean;
}

export function SeoDetailCard({ row, seo, topIssues, compact = false }: SeoDetailCardProps) {
  const hasSearchData =
    Boolean(row.titleFromSearch?.trim()) ||
    Boolean(row.snippetFromSearch?.trim()) ||
    Boolean(row.urlFromSearch?.trim());

  const displayUrl = ensureAbsoluteUrl(row.urlFromSearch) || row.urlFromSearch;
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
      className={`min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 transition-all duration-200 ${
        compact ? 'mt-1.5' : 'mt-2'
      }`}
    >
      {/* Header: плотный верхний блок */}
      <div className="px-2.5 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                Источник из поиска
              </span>
              <CompactBadge label={statusLabel} variant={statusVariant} />
            </div>
            <DetailRow label="Заголовок" value={row.titleFromSearch?.trim() || undefined} />
            <DetailRow label="Сниппет" value={row.snippetFromSearch?.trim() || undefined} />
            <div className="flex items-start gap-1.5 min-w-0 py-0.5">
              <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500 w-16">URL</span>
              {displayUrl ? (
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline truncate block"
                  title={displayUrl}
                >
                  {displayUrl}
                </a>
              ) : (
                <EmptyValue />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Grid: 3 колонки по строкам */}
      <div className="px-2.5 py-2">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Row 1 */}
          <MiniStatCard
            label="Robots"
            value={seo?.robots}
            status={!seo ? 'neutral' : seo.robots === 'OK' ? 'ok' : 'warn'}
          />
          <MiniStatCard label="Meta Title" value={seo?.metaTitle} status="neutral" />
          <CompactContact
            type="phone"
            value={row.phone || ''}
            href={row.phone ? `tel:${row.phone.replace(/\s/g, '')}` : '#'}
          />
          {/* Row 2 */}
          <MiniStatCard
            label="Sitemap"
            value={seo?.sitemap}
            status={!seo ? 'neutral' : seo.sitemap === 'OK' ? 'ok' : 'warn'}
          />
          <MiniStatCard label="Meta Description" value={seo?.metaDesc} status="neutral" />
          <CompactContact
            type="email"
            value={row.email || ''}
            href={row.email ? `mailto:${row.email}` : '#'}
          />
          {/* Row 3 */}
          <MiniStatCard label="Pages Crawled" value={seo?.pagesCrawled} />
          <MiniStatCard label="H1" value={seo?.h1} />
        </div>

        {/* Top Issues — компактная полоска */}
        {topIssues.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap gap-1">
              {topIssues.map((issue, i) => (
                <span
                  key={i}
                  className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                >
                  {issue}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
