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
        'cursor-pointer px-4 py-3 text-sm transition-colors hover:bg-slate-50',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 font-medium text-slate-900">
          <span className="truncate">{company.name || '—'}</span>
        </div>
        {company.rating != null && (
          <span className={cn('app-badge', ratingBadgeClass)}>
            ★ {Number(company.rating).toFixed(1)}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{company.address || '—'}</span>
        <span>·</span>
        <span>отзывов {reviewsTotal}</span>
        {reviewsNeg > 0 && (
          <>
            <span>·</span>
            <span className="text-red-600">негатив {reviewsNeg}</span>
          </>
        )}
        {ownerReplies && (
          <>
            <span>·</span>
            <span className="text-emerald-700">владелец отвечает</span>
          </>
        )}
        {company.source && (
          <>
            <span>·</span>
            <span>{sourceLabel(company.source)}</span>
          </>
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

      {/* фолбэк для совместимости со старым кодом */}
      {id == null && <span className="hidden">{/* unused */}</span>}
    </li>
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
