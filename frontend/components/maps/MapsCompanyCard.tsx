'use client';

/**
 * MapsCompanyCard — карточка компании в выдаче (вид Premium, 16.09, прототип «Результаты»).
 *
 * Раскладка: цветная полоса приоритета · чекбокс · суть (название, адрес, рейтинг, боли с числом
 * упоминаний, цитата, признаки в одну строку) · справа контакты и действия «КП под боль» / «В список».
 * Цвет только там, где он что-то значит: полоса (много негатива), рейтинг, признаки.
 *
 * Бизнес-логика прежняя: профиль выбранного источника (focusedProfile), несколько источников,
 * выбор чекбоксом, строка AI-анализа, ссылки на карточку в 2GIS / Я.Картах / Google.
 */

import { ExternalLink, Send, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { isUnnamedPainLabel } from '@/lib/painLabels';
import type { CompanyOut, CompanyPainOut, PainTagShort } from '@/src/services/api/maps';
import type { CompanyAnalysisOut } from '@/src/services/api/reviews-ai';

type CardCompany = Partial<CompanyOut> & {
  id?: number;
  company_id?: number;
  name?: string;
  pain_tags?: PainTagShort[];
  top_pains?: CompanyPainOut[];
  negative_snippets?: string[];
};

interface Props {
  company: CardCompany;
  onClick?: () => void;
  onAddToList?: (company: CardCompany) => void;
  onDraftEmail?: (company: CardCompany) => void;
  draftEmailLoading?: boolean;
  hideActions?: boolean;
  aiAnalysis?: CompanyAnalysisOut | null;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  activeSource?: 'all' | '2gis' | 'yandex_maps' | 'google_maps' | null;
  /** Дополнительная кнопка рядом с действиями (например, «Убрать из списка» на странице списка). */
  extraAction?: React.ReactNode;
}

type FlagTone = 'danger' | 'warning' | 'success' | 'muted';

const FLAG_TONE: Record<FlagTone, string> = {
  danger: 'text-ui-danger',
  warning: 'text-ui-warning',
  success: 'text-ui-success',
  muted: 'text-ui-text-muted font-medium',
};

export function MapsCompanyCard({
  company,
  onClick,
  onAddToList,
  onDraftEmail,
  draftEmailLoading,
  hideActions,
  aiAnalysis,
  selected,
  onToggleSelect,
  activeSource,
  extraAction,
}: Props) {
  const id = company.id ?? company.company_id;
  const sourcesProfiles = Array.isArray(company.sources_profiles) ? company.sources_profiles : [];
  const focusedProfile =
    activeSource && activeSource !== 'all' && sourcesProfiles.length > 1
      ? (sourcesProfiles.find((sp) => sp.source === activeSource) ?? null)
      : null;

  const focusedPhone = focusedProfile?.contacts.find((c) => c.type === 'phone')?.value ?? null;
  const focusedWebsite = focusedProfile?.contacts.find((c) => c.type === 'website')?.value ?? null;
  const focusedEmails = focusedProfile
    ? focusedProfile.contacts.filter((c) => c.type === 'email').map((c) => c.value)
    : null;

  const reviewsTotal = focusedProfile?.reviews_count ?? company.reviews_count ?? 0;
  const reviewsNeg = focusedProfile?.reviews_negative_count ?? company.reviews_negative_count ?? 0;
  const ownerReplies = focusedProfile?.has_owner_replies ?? company.has_owner_replies;
  const rating = focusedProfile?.rating ?? company.rating ?? null;
  const phone = focusedPhone ?? company.phone ?? null;
  const website = focusedWebsite ?? company.website ?? null;
  const emails = focusedEmails ?? (Array.isArray(company.emails) ? company.emails : []);
  const topPains = dedupePains(
    Array.isArray(company.top_pains)
      ? company.top_pains.filter((p) => !isUnnamedPainLabel(p.label))
      : [],
  );
  const negativeSnippets = Array.isArray(company.negative_snippets)
    ? company.negative_snippets
    : [];
  const fallbackTags =
    topPains.length === 0 && Array.isArray(company.pain_tags)
      ? company.pain_tags.filter((t) => !isUnnamedPainLabel(t.label))
      : [];
  const quote = topPains.find((p) => p.top_quote)?.top_quote ?? negativeSnippets[0] ?? null;
  const fullAddress = formatAddressWithCity(company.address, company.city);
  const hasWebsite = typeof website === 'string' && website.trim().length > 0;

  const singleSource = focusedProfile?.source ?? company.source;
  const singleExternalId = focusedProfile?.external_id ?? company.external_id;
  const sourceLinks: { source: string; label: string; url: string | null }[] =
    sourcesProfiles.length > 1
      ? sourcesProfiles
          .filter((sp) => !activeSource || activeSource === 'all' || sp.source === activeSource)
          .map((sp) => ({
            source: sp.source,
            label: sourceLabel(sp.source),
            url: sp.source_url ?? buildSourceUrl(sp.source, sp.external_id),
          }))
      : singleSource
        ? [
            {
              source: singleSource,
              label: sourceLabel(singleSource),
              url: focusedProfile?.source_url ?? buildSourceUrl(singleSource, singleExternalId),
            },
          ]
        : [];

  // Полоса приоритета: красная — много негатива или высокая «температура», жёлтая — есть негатив.
  const stage: 'hot' | 'warm' | 'cool' = (() => {
    const temp = typeof company.lead_temperature === 'number' ? company.lead_temperature : 0;
    if (reviewsNeg >= 5 || temp >= 70) return 'hot';
    if (reviewsNeg >= 1 || temp >= 40) return 'warm';
    return 'cool';
  })();

  const legalType =
    company.legal?.opf ?? company.legal?.legal_short_name?.match(/^([А-ЯЁ]{2,})\s/)?.[1] ?? null;
  const legalParts = [
    legalType,
    typeof company.legal?.age_years === 'number' ? formatYears(company.legal.age_years) : null,
    typeof company.legal?.revenue === 'number' && company.legal.revenue > 0
      ? formatRevenue(company.legal.revenue)
      : null,
  ].filter(Boolean);

  const flags: { tone: FlagTone; text: string; title?: string }[] = [];
  if (reviewsNeg > 0)
    flags.push({
      tone: 'danger',
      text: `${reviewsNeg} ${plural(reviewsNeg, 'негативный отзыв', 'негативных отзыва', 'негативных отзывов')}`,
    });
  if (company.hiring_marketing)
    flags.push({
      tone: 'danger',
      text: 'ищет маркетолога',
      title: company.hiring_url
        ? `Вакансия на hh.ru: ${company.hiring_url}`
        : 'Вакансия маркетолога на hh.ru',
    });
  if (company.has_lpr === true)
    flags.push({
      tone: 'success',
      text: 'ЛПР известен',
      title: 'Руководитель известен: DaData или страница «О нас» на сайте',
    });
  if (company.has_lpr === false) flags.push({ tone: 'muted', text: 'ЛПР не найден' });
  if (ownerReplies === true) flags.push({ tone: 'muted', text: 'владелец отвечает на отзывы' });
  if (legalParts.length > 0)
    flags.push({
      tone: 'muted',
      text: legalParts.join(' · '),
      title: company.legal?.legal_short_name
        ? `${company.legal.legal_short_name}${company.legal.inn ? ` · ИНН ${company.legal.inn}` : ''}`
        : undefined,
    });

  const selectable = onToggleSelect && id != null;

  return (
    <li
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' && e.target === e.currentTarget) onClick();
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${company.name ?? 'Компания'} — открыть отзывы и контакты` : undefined}
      className={cn(
        'group grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-panel border bg-ui-surface p-4 shadow-raised transition-all sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40',
        selected ? 'border-ui-accent/30 bg-ui-accent/[.02]' : 'border-black/[.05]',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-floating',
      )}
    >
      {/* Полоса приоритета и чекбокс — одна колонка слева */}
      <div className="row-span-2 flex gap-3 lg:row-span-1">
        <span
          aria-hidden
          title={
            stage === 'hot'
              ? 'Много негатива — горячий лид'
              : stage === 'warm'
                ? 'Есть негатив'
                : 'Негатива нет'
          }
          className={cn(
            'w-[5px] shrink-0 rounded-full',
            selected
              ? 'bg-ui-accent'
              : stage === 'hot'
                ? 'bg-red-300'
                : stage === 'warm'
                  ? 'bg-amber-300'
                  : 'bg-ui-border',
          )}
        />
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect(id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Выбрать: ${company.name ?? 'компания'}`}
            className="mt-1 h-[18px] w-[18px] cursor-pointer accent-[hsl(var(--color-accent))]"
          />
        )}
      </div>

      {/* Суть */}
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className="text-base font-bold leading-snug tracking-tight text-ui-text">
              {company.name || '—'}
            </h3>
            {fullAddress && (
              <span className="min-w-0 text-small text-ui-text-muted">{fullAddress}</span>
            )}
          </div>
          {rating != null && (
            <span
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-3 py-0.5 text-small font-semibold tabular-nums',
                rating < 4
                  ? 'bg-red-50 text-red-700'
                  : rating < 4.3
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-green-50 text-green-700',
              )}
              title={`Рейтинг ${Number(rating).toFixed(1)} · ${reviewsTotal} ${plural(reviewsTotal, 'отзыв', 'отзыва', 'отзывов')}`}
            >
              {Number(rating).toFixed(1)} ★{' '}
              {reviewsTotal > 0 && (
                <span className="font-medium opacity-75">{reviewsTotal} отз.</span>
              )}
            </span>
          )}
        </div>

        {aiAnalysis && <AiAnalysisRow analysis={aiAnalysis} />}

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {topPains.length > 0 ? (
            topPains.slice(0, 4).map((p) => (
              <span
                key={p.pain_tag_id}
                title={p.description ?? p.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-ui-accent/[.08] px-3 py-0.5 text-xs font-semibold text-ui-accent"
              >
                {p.label}
                {p.mention_count > 1 && (
                  <span className="font-medium tabular-nums text-ui-text-muted">
                    ×{p.mention_count}
                  </span>
                )}
              </span>
            ))
          ) : fallbackTags.length > 0 ? (
            fallbackTags.slice(0, 4).map((t) => (
              <span
                key={t.id}
                className="rounded-full bg-ui-surface-2 px-3 py-0.5 text-xs font-semibold text-ui-text-muted"
              >
                {t.label}
              </span>
            ))
          ) : (
            <span className="text-xs font-semibold text-ui-text-muted">
              {reviewsNeg > 0 ? 'боли ещё не разобраны' : 'боли не найдены'}
            </span>
          )}
        </div>

        {quote && (
          <p className="mt-2.5 max-w-[62ch] text-small leading-relaxed text-ui-text-muted">
            «{quote}»
          </p>
        )}

        {flags.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold">
            {flags.map((f, i) => (
              <span key={f.text} className="inline-flex items-center gap-2.5">
                {i > 0 && (
                  <span aria-hidden className="text-ui-border">
                    ·
                  </span>
                )}
                <span className={FLAG_TONE[f.tone]} title={f.title}>
                  {f.text}
                </span>
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Контакты и действия: на широком экране — колонка справа, на узком — под сутью */}
      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:col-start-3 lg:w-[240px] lg:flex-col lg:items-end lg:justify-center lg:gap-1.5 lg:text-right">
        {phone && (
          <a
            href={`tel:${phone}`}
            onClick={(e) => e.stopPropagation()}
            className="whitespace-nowrap text-small font-semibold tabular-nums text-ui-text hover:text-ui-accent"
          >
            {phone}
          </a>
        )}
        {hasWebsite && website ? (
          <a
            href={normalizeUrl(website.trim())}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="max-w-[240px] truncate text-small font-semibold text-ui-accent hover:underline"
          >
            {stripScheme(website.trim())}
          </a>
        ) : (
          <span className="text-small font-semibold text-ui-warning">сайта нет</span>
        )}
        {emails.length > 0 && (
          <a
            href={`mailto:${emails[0]}`}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[240px] truncate text-small text-ui-text-muted hover:text-ui-accent"
            title={emails.join(', ')}
          >
            {emails[0]}
            {emails.length > 1 && ` +${emails.length - 1}`}
          </a>
        )}
        {sourceLinks.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-x-2 text-xs text-ui-text-muted lg:justify-end">
            {sourceLinks.map((s) =>
              s.url ? (
                <a
                  key={s.source}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 hover:text-ui-accent"
                  title={`Открыть карточку в ${s.label}`}
                >
                  {s.label}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : (
                <span key={s.source}>{s.label}</span>
              ),
            )}
          </span>
        )}
        {!hideActions && (onAddToList || onDraftEmail || extraAction) && (
          <div className="flex flex-wrap gap-1.5 lg:mt-1.5 lg:justify-end">
            {onDraftEmail && (
              <button
                type="button"
                disabled={draftEmailLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  onDraftEmail(company);
                }}
                title={
                  topPains.length === 0
                    ? 'Сгенерировать КП по шаблону — боли в отзывах ещё не разобраны'
                    : 'Сгенерировать КП под боль клиентов из отзывов'
                }
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ui-text px-3.5 text-small font-semibold text-ui-surface transition-colors hover:bg-black disabled:cursor-wait disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                {draftEmailLoading ? 'Подготовка…' : topPains.length > 0 ? 'КП под боль' : 'КП'}
              </button>
            )}
            {onAddToList && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToList(company);
                }}
                className="inline-flex min-h-9 items-center rounded-full bg-ui-surface-2 px-3.5 text-small font-semibold text-ui-text-muted transition-colors hover:bg-ui-border hover:text-ui-text"
              >
                В список
              </button>
            )}
            {extraAction}
          </div>
        )}
      </div>
    </li>
  );
}

/* ===== Части ===== */

function AiAnalysisRow({ analysis }: { analysis: CompanyAnalysisOut }) {
  const score = analysis.score ?? 0;
  const tone =
    analysis.status === 'failed'
      ? 'text-ui-danger'
      : analysis.status === 'pending'
        ? 'text-ui-text-muted'
        : score >= 7
          ? 'text-ui-success'
          : score >= 4
            ? 'text-ui-warning'
            : 'text-ui-text-muted';
  return (
    <p
      className={cn('mt-1.5 flex items-center gap-1.5 text-xs font-semibold', tone)}
      title={analysis.comment ?? analysis.error ?? ''}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {analysis.status === 'pending'
          ? 'AI: считаю…'
          : analysis.status === 'failed'
            ? 'AI: ошибка'
            : `AI: ${analysis.score ?? '—'}/10${analysis.comment ? ` · ${analysis.comment.slice(0, 80)}` : ''}`}
      </span>
    </p>
  );
}

/* ===== Утилиты ===== */

// Почти-дубли («Качество услуг» дважды) в чипах не повторяем.
function dedupePains(pains: CompanyPainOut[]): CompanyPainOut[] {
  const seen = new Set<string>();
  return pains.filter((p) => {
    const key = (p.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatYears(n: number): string {
  return `${n} ${plural(n, 'год', 'года', 'лет')}`;
}

function formatRevenue(rub: number): string {
  const mln = rub / 1_000_000;
  return `${mln.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`;
}

function sourceLabel(source: string | null | undefined): string {
  if (source === '2gis') return '2GIS';
  if (source === 'yandex_maps') return 'Я.Карты';
  if (source === 'google_maps') return 'Google Maps';
  return source ?? '';
}

function buildSourceUrl(
  source: string | null | undefined,
  externalId: string | null | undefined,
): string | null {
  if (!externalId || !source) return null;
  if (source === '2gis') return `https://2gis.ru/firm/${externalId}`;
  if (source === 'yandex_maps') return `https://yandex.ru/maps/org/${externalId}`;
  if (source === 'google_maps')
    return `https://www.google.com/maps/place/?q=place_id:${externalId}`;
  return null;
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
  city: string | null | undefined,
): string | null {
  const a = (address ?? '').trim();
  const c = (city ?? '').trim();
  if (!a && !c) return null;
  if (!a) return c;
  if (!c) return a;
  if (a.toLowerCase().includes(c.toLowerCase())) return a;
  return `${c}, ${a}`;
}
