'use client';

/**
 * Карточка компании в списке результатов. Используется в MapsCompaniesList и
 * при live-стриме (рендерим частичные данные если приходит только {company_id, name, ...}).
 *
 * Что показываем:
 *  - название, адрес, рейтинг, кол-во отзывов/негатива, owner_replies
 *  - контакты: phone, website, emails (если краулер обогатил)
 *  - топ-3 болей с короткой цитатой клиента под каждой (CompanyPainOut)
 *  - кнопки [В список] [Письмо] — обработка через коллбэки родителя
 */

import { Mail, ListPlus, Phone, Globe, MessageSquareQuote } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CompanyOut, CompanyPainOut, PainTagShort } from '@/src/services/api/maps';

type CardCompany = Partial<CompanyOut> & {
  id?: number;
  company_id?: number;
  name?: string;
  pain_tags?: PainTagShort[];
  top_pains?: CompanyPainOut[];
};

interface Props {
  company: CardCompany;
  onClick?: () => void;
  onAddToList?: (company: CardCompany) => void;
  onDraftEmail?: (company: CardCompany) => void;
  draftEmailLoading?: boolean;
  hideActions?: boolean;
}

export function MapsCompanyCard({
  company,
  onClick,
  onAddToList,
  onDraftEmail,
  draftEmailLoading,
  hideActions,
}: Props) {
  const id = company.id ?? company.company_id;
  const reviewsTotal = company.reviews_count ?? 0;
  const reviewsNeg = company.reviews_negative_count ?? 0;
  const ownerReplies = company.has_owner_replies;
  const ratingBadgeClass = ratingClass(company.rating);
  const emails = Array.isArray(company.emails) ? company.emails : [];
  const topPains = Array.isArray(company.top_pains) ? company.top_pains : [];
  const fullAddress = formatAddressWithCity(company.address, company.city);
  // website считаем валидным только если непустая строка после trim.
  // 2GIS иногда отдаёт " " или "" — без trim фронт показывал «есть сайт» там,
  // где на самом деле сайта нет (и бэк-фильтр has_website=true их пропускал).
  const hasWebsite = typeof company.website === 'string' && company.website.trim().length > 0;
  const fallbackTags =
    topPains.length === 0 && Array.isArray(company.pain_tags) ? company.pain_tags : [];

  return (
    <li
      className={cn(
        'px-4 py-3 text-sm transition-colors hover:bg-slate-50',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <div
        className="flex items-start justify-between gap-3"
        onClick={onClick}
        role={onClick ? 'button' : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-900">{company.name || '—'}</div>
          {fullAddress && (
            <div className="mt-0.5 truncate text-xs text-slate-500">{fullAddress}</div>
          )}
        </div>
        {company.rating != null && (
          <span className={cn('app-badge shrink-0', ratingBadgeClass)}>
            ★ {Number(company.rating).toFixed(1)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={onClick}>
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
        {hasWebsite ? (
          <MetricPill label="есть сайт" tone="neutral" />
        ) : (
          <MetricPill label="нет сайта" tone="warn" />
        )}
        {company.source && (
          <span className="ml-auto text-[11px] text-slate-400">{sourceLabel(company.source)}</span>
        )}
      </div>

      {(company.phone || company.website || emails.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
          {company.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3 text-slate-400" />
              <a
                href={`tel:${company.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:underline"
              >
                {company.phone}
              </a>
            </span>
          )}
          {hasWebsite && (
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3 text-slate-400" />
              <a
                href={normalizeUrl(company.website!.trim())}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="max-w-[180px] truncate hover:underline"
              >
                {stripScheme(company.website!.trim())}
              </a>
            </span>
          )}
          {emails.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3 text-emerald-500" />
              <a
                href={`mailto:${emails[0]}`}
                onClick={(e) => e.stopPropagation()}
                className="text-emerald-700 hover:underline"
              >
                {emails[0]}
              </a>
              {emails.length > 1 && (
                <span className="text-[11px] text-slate-400">+{emails.length - 1}</span>
              )}
            </span>
          )}
        </div>
      )}

      {topPains.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {topPains.slice(0, 3).map((p) => (
            <div
              key={p.pain_tag_id}
              className="rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  {p.label}
                </span>
                {p.mention_count > 0 && (
                  <span className="text-[11px] text-amber-700/80">
                    × {p.mention_count}
                  </span>
                )}
              </div>
              {p.top_quote && (
                <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-700">
                  <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <span className="line-clamp-2 italic">«{p.top_quote}»</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        fallbackTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {fallbackTags.slice(0, 5).map((t: PainTagShort) => (
              <span
                key={t.id}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
              >
                {t.label}
              </span>
            ))}
          </div>
        )
      )}

      {!hideActions && (onAddToList || onDraftEmail) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onAddToList && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddToList(company);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <ListPlus className="h-3.5 w-3.5" />
              В список
            </button>
          )}
          {onDraftEmail && (
            <button
              type="button"
              disabled={draftEmailLoading}
              onClick={(e) => {
                e.stopPropagation();
                onDraftEmail(company);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-slate-800',
                draftEmailLoading && 'opacity-70'
              )}
              title={
                topPains.length === 0
                  ? 'AI ещё не подсчитал боли клиентов из отзывов — драфт получится общий, без цитат. Попробуй позже когда придёт анализ.'
                  : ''
              }
            >
              <Mail className="h-3.5 w-3.5" />
              {draftEmailLoading ? 'Генерирую…' : 'Письмо'}
            </button>
          )}
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

function normalizeUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return 'https://' + url;
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function formatAddressWithCity(
  address: string | null | undefined,
  city: string | null | undefined
): string | null {
  const a = (address ?? '').trim();
  const c = (city ?? '').trim();
  if (!a && !c) return null;
  if (!a) return c;
  if (!c) return a;
  // Если город уже в адресе (нечувствительно к регистру) — не дублируем.
  if (a.toLowerCase().includes(c.toLowerCase())) return a;
  return `${c}, ${a}`;
}
