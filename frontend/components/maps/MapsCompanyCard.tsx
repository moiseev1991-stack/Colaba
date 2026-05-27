'use client';

/**
 * Карточка компании в списке результатов. Используется в MapsCompaniesList и
 * при live-стриме (рендерим частичные данные если приходит только {company_id, name, ...}).
 */

import { cn } from '@/lib/utils';
import type { CompanyOut, PainTagShort } from '@/src/services/api/maps';

type CardCompany = Partial<CompanyOut> & {
  id?: number;
  company_id?: number;
  name?: string;
  pain_tags?: PainTagShort[];
};

interface Props {
  company: CardCompany;
  onClick?: () => void;
}

export function MapsCompanyCard({ company, onClick }: Props) {
  const id = company.id ?? company.company_id;
  const reviewsTotal = company.reviews_count ?? 0;
  const reviewsNeg = company.reviews_negative_count ?? 0;
  const ownerReplies = company.has_owner_replies;
  const ratingBadgeClass = ratingClass(company.rating);

  return (
    <li
      onClick={onClick}
      className={cn(
        'px-4 py-3 text-sm transition-colors hover:bg-slate-50',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-900">{company.name || '—'}</div>
          {company.address && (
            <div className="mt-0.5 truncate text-xs text-slate-500">{company.address}</div>
          )}
        </div>
        {company.rating != null && (
          <span className={cn('app-badge shrink-0', ratingBadgeClass)}>
            ★ {Number(company.rating).toFixed(1)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <MetricPill label={`${reviewsTotal} отзывов`} tone="neutral" />
        <MetricPill
          label={`негатив ${reviewsNeg}`}
          tone={reviewsNeg >= 5 ? 'danger' : reviewsNeg > 0 ? 'warn' : 'neutral'}
        />
        {ownerReplies === true ? (
          <MetricPill label="отвечает владелец" tone="success" />
        ) : ownerReplies === false && reviewsTotal > 0 ? (
          <MetricPill label="не отвечает" tone="danger" />
        ) : null}
        {company.source && (
          <span className="ml-auto text-[11px] text-slate-400">{sourceLabel(company.source)}</span>
        )}
      </div>

      {Array.isArray(company.pain_tags) && company.pain_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {company.pain_tags.slice(0, 5).map((t: PainTagShort) => (
            <span
              key={t.id}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      {id == null && <span className="hidden">{/* unused */}</span>}
    </li>
  );
}

function MetricPill({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'success' | 'warn' | 'danger';
}) {
  const styles = {
    neutral: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    warn: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
    danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  }[tone];
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', styles)}>{label}</span>
  );
}

function ratingClass(rating: number | null | undefined): string {
  if (rating == null) return 'app-badge-accent';
  if (rating >= 4.3) return 'app-badge-success';
  if (rating <= 3.5) return 'app-badge-danger';
  return 'app-badge-accent';
}

function sourceLabel(source: string): string {
  if (source === '2gis') return '2GIS';
  if (source === 'yandex_maps') return 'Я.Карты';
  return source;
}
