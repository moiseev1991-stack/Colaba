'use client';

/**
 * MapsCompanyCard v2 — карточка компании в новом дизайн-языке.
 * §4.1 ТЗ редизайна 2026-06-03.
 *
 * Новая иерархия:
 *   1. Название (display-шрифт, крупно) + рейтинг-пилюля справа
 *   2. Адрес (text-subtle, мельче)
 *   3. SignalPill-ряд: «нет сайта» как accent (горячий сигнал), «отвечает
 *      владелец» good, «негатив N» hot/warm, «не отвечает» warm
 *   4. Зона «диагноза» — pain-теги с иконкой-пульс ИЛИ розовый блок
 *      с цитатой негативного отзыва (когда AI ещё не разобрал)
 *   5. Контакты (phone/email/2GIS-deeplink)
 *   6. Действия — «В список» secondary, «Письмо» primary (бренд-градиент)
 *      Мобайл — min-h-11 (44px тач-таргет)
 *
 * Бейджи 🔥/💼/Nл (lead_temperature, website_lead_score, age_years)
 * сохранены — без них исчезает «фишка диагноза». Подписаны через title.
 */

import { ExternalLink, ListPlus, Mail, MessageSquareQuote, Sparkles, Activity, Phone, Globe } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CompanyOut, CompanyPainOut, PainTagShort } from '@/src/services/api/maps';
import type { CompanyAnalysisOut } from '@/src/services/api/reviews-ai';
import { SignalPill } from '@/components/ui/SignalPill';
import { CardV2 } from '@/components/ui/CardV2';
import { ButtonV2 } from '@/components/ui/ButtonV2';

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
}

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
}: Props) {
  const id = company.id ?? company.company_id;
  const reviewsTotal = company.reviews_count ?? 0;
  const reviewsNeg = company.reviews_negative_count ?? 0;
  const ownerReplies = company.has_owner_replies;
  const emails = Array.isArray(company.emails) ? company.emails : [];
  const topPains = Array.isArray(company.top_pains) ? company.top_pains : [];
  const negativeSnippets = Array.isArray(company.negative_snippets) ? company.negative_snippets : [];
  const fullAddress = formatAddressWithCity(company.address, company.city);
  const hasWebsite = typeof company.website === 'string' && company.website.trim().length > 0;
  const fallbackTags =
    topPains.length === 0 && Array.isArray(company.pain_tags) ? company.pain_tags : [];

  const sourceUrl = buildSourceUrl(company.source, company.external_id);
  const sourceTitle = sourceLabel(company.source);

  return (
    <CardV2
      as="li"
      reveal
      interactive={!!onClick}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      className={cn(
        'relative p-4',
        selected && 'ring-2 ring-brand-500/60',
        onToggleSelect && id != null && 'pl-10'
      )}
    >
      {/* Bulk-чекбокс — абсолютно позиционирован, не ломает структуру */}
      {onToggleSelect && id != null && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect(id)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Выбрать компанию"
          className="absolute left-3 top-4 h-4 w-4 cursor-pointer accent-emerald-600"
        />
      )}

      {/* Шапка: название (display) + рейтинг */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] sm:text-[16px] font-semibold leading-snug tracking-tight text-[hsl(var(--text))] truncate">
            {company.name || '—'}
          </h3>
          {fullAddress && (
            <div className="mt-0.5 truncate text-[12px] text-[hsl(var(--muted))]">
              {fullAddress}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {company.rating != null && (
            <RatingPill rating={Number(company.rating)} />
          )}
          {typeof company.lead_temperature === 'number' && (
            <SignalPill
              size="sm"
              tone={tempTone(company.lead_temperature)}
              title="Температура лида: рейтинг × отзывы × свежесть × контакты"
            >
              🔥 {company.lead_temperature}
            </SignalPill>
          )}
          {typeof company.website_lead_score === 'number' && (
            <SignalPill
              size="sm"
              tone={tempTone(company.website_lead_score)}
              title="Website-score: «нужен сайт, а его нет» — кандидат на продажу сайта"
            >
              💼 {company.website_lead_score}
            </SignalPill>
          )}
          {company.legal && (typeof company.legal.revenue === 'number' || typeof company.legal.age_years === 'number') && (
            <SignalPill
              size="sm"
              tone="cool"
              title={`ИНН: ${company.legal.inn ?? '—'} · ${company.legal.legal_short_name ?? company.legal.legal_name ?? ''}`}
            >
              {typeof company.legal.revenue === 'number' && company.legal.revenue > 0
                ? `₽ ${(company.legal.revenue / 1_000_000).toFixed(1)}М`
                : ''}
              {typeof company.legal.revenue === 'number' && company.legal.revenue > 0 && typeof company.legal.age_years === 'number' ? ' · ' : ''}
              {typeof company.legal.age_years === 'number' ? `${company.legal.age_years}л` : ''}
            </SignalPill>
          )}
        </div>
      </div>

      {/* AI-анализ под выбранный пресет */}
      {aiAnalysis && <AiAnalysisRow analysis={aiAnalysis} />}

      {/* SignalPill-ряд: единая шкала, «нет сайта» как accent */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <SignalPill tone="muted">{reviewsTotal} отзывов</SignalPill>
        {reviewsNeg > 0 && (
          <SignalPill tone={reviewsNeg >= 5 ? 'hot' : 'warm'}>
            негатив {reviewsNeg}
          </SignalPill>
        )}
        {ownerReplies === true ? (
          <SignalPill tone="good">отвечает владелец</SignalPill>
        ) : ownerReplies === false && reviewsTotal > 0 ? (
          <SignalPill tone="warm">не отвечает</SignalPill>
        ) : null}
        {hasWebsite ? (
          <SignalPill tone="muted">есть сайт</SignalPill>
        ) : (
          <SignalPill tone="accent" title="Нет сайта — горячий сигнал для продажи сайта">
            нужен сайт
          </SignalPill>
        )}
        {company.source && (
          <span className="ml-auto text-[11px] text-[hsl(var(--muted))]">
            {sourceTitle}
          </span>
        )}
      </div>

      {/* Зона «диагноза»: pain-теги или fallback-цитаты негатива */}
      {topPains.length > 0 ? (
        <PainBlock pains={topPains} />
      ) : negativeSnippets.length > 0 ? (
        <NegativeSnippetsBlock snippets={negativeSnippets} />
      ) : (
        fallbackTags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {fallbackTags.slice(0, 5).map((t: PainTagShort) => (
              <span
                key={t.id}
                className="rounded-pill bg-[hsl(var(--surface-2))] px-2 py-0.5 text-[11px] text-[hsl(var(--text))]"
              >
                {t.label}
              </span>
            ))}
          </div>
        )
      )}

      {/* Контакты */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[hsl(var(--muted))]">
        {company.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3 text-[hsl(var(--muted))]" />
            <a
              href={`tel:${company.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-brand-600 hover:underline"
            >
              {company.phone}
            </a>
          </span>
        )}
        {hasWebsite && (
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3 text-[hsl(var(--muted))]" />
            <a
              href={normalizeUrl(company.website!.trim())}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="max-w-[180px] truncate hover:text-brand-600 hover:underline"
            >
              {stripScheme(company.website!.trim())}
            </a>
          </span>
        )}
        {emails.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3 w-3 text-[color:var(--signal-good)]" />
            <a
              href={`mailto:${emails[0]}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[color:var(--signal-good)] hover:underline"
            >
              {emails[0]}
            </a>
            {emails.length > 1 && (
              <span className="text-[11px] text-[hsl(var(--muted))]">+{emails.length - 1}</span>
            )}
          </span>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto inline-flex items-center gap-1 rounded-v2-sm border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--text))] hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400"
            title={`Открыть карточку в ${sourceTitle}`}
          >
            <ExternalLink className="h-3 w-3" />
            {sourceTitle}
          </a>
        )}
      </div>

      {/* Действия — primary бренд-градиент, secondary surface */}
      {!hideActions && (onAddToList || onDraftEmail) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onAddToList && (
            <ButtonV2
              variant="secondary"
              size="md"
              iconLeft={<ListPlus />}
              onClick={(e) => {
                e.stopPropagation();
                onAddToList(company);
              }}
            >
              В список
            </ButtonV2>
          )}
          {onDraftEmail && (
            <ButtonV2
              variant="primary"
              size="md"
              loading={draftEmailLoading}
              iconLeft={<Mail />}
              onClick={(e) => {
                e.stopPropagation();
                onDraftEmail(company);
              }}
              title={
                topPains.length === 0
                  ? 'AI ещё не подсчитал боли — драфт будет общий'
                  : ''
              }
            >
              Письмо
            </ButtonV2>
          )}
        </div>
      )}

      {id == null && <span className="hidden">{/* unused */}</span>}
    </CardV2>
  );
}

/* ===== Сабкомпоненты ===== */

function RatingPill({ rating }: { rating: number }) {
  const tone: 'good' | 'warm' | 'hot' | 'muted' =
    rating >= 4.3 ? 'good' : rating <= 3.5 ? 'hot' : 'warm';
  return (
    <SignalPill tone={tone} size="sm">
      <span className="font-semibold">★ {rating.toFixed(1)}</span>
    </SignalPill>
  );
}

function PainBlock({ pains }: { pains: CompanyPainOut[] }) {
  return (
    <div className="mt-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
        <Activity className="h-3 w-3 text-[color:var(--signal-warm)]" />
        Диагноз по отзывам
      </div>
      {pains.slice(0, 3).map((p) => (
        <div
          key={p.pain_tag_id}
          className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-2.5 py-1.5"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-pill bg-[var(--signal-warm)]/20 px-2 py-0.5 text-[11px] font-medium text-[color:var(--signal-warm)]">
              {p.label}
            </span>
            {p.mention_count > 0 && (
              <span className="text-[11px] text-[color:var(--signal-warm)]/80">
                × {p.mention_count}
              </span>
            )}
          </div>
          {p.top_quote && (
            <div className="mt-1 flex items-start gap-1.5 text-[12px] text-[hsl(var(--text))]">
              <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--signal-warm)]" />
              <span className="line-clamp-2 italic">«{p.top_quote}»</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NegativeSnippetsBlock({ snippets }: { snippets: string[] }) {
  return (
    <div className="mt-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[color:var(--signal-hot)]">
        <Activity className="h-3 w-3" />
        Жалобы клиентов
      </div>
      {snippets.slice(0, 2).map((quote, idx) => (
        <div
          key={idx}
          className="rounded-v2-sm border border-[color:var(--signal-hot)]/30 bg-[var(--signal-hot-bg)] px-2.5 py-1.5"
          title="AI ещё не разобрал боли — показан кусок негативного отзыва"
        >
          <div className="flex items-start gap-1.5 text-[12px] text-[hsl(var(--text))]">
            <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--signal-hot)]" />
            <span className="line-clamp-2 italic">«{quote}»</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AiAnalysisRow({ analysis }: { analysis: CompanyAnalysisOut }) {
  const tone: 'good' | 'warm' | 'muted' | 'hot' =
    analysis.status === 'pending' ? 'muted' :
    analysis.status === 'failed' ? 'hot' :
    (analysis.score ?? 0) >= 7 ? 'good' :
    (analysis.score ?? 0) >= 4 ? 'warm' : 'muted';

  return (
    <SignalPill
      tone={tone}
      className="mt-1.5"
      icon={<Sparkles />}
      title={analysis.comment ?? analysis.error ?? ''}
    >
      {analysis.status === 'pending' ? 'AI: считаю…' :
       analysis.status === 'failed' ? 'AI: ошибка' :
       <>AI: {analysis.score ?? '—'}/10{analysis.comment ? ` · ${analysis.comment.slice(0, 60)}` : ''}</>}
    </SignalPill>
  );
}

/* ===== Утилиты ===== */

function tempTone(t: number): 'hot' | 'warm' | 'muted' {
  if (t >= 70) return 'hot';
  if (t >= 40) return 'warm';
  return 'muted';
}

function sourceLabel(source: string | null | undefined): string {
  if (source === '2gis') return '2GIS';
  if (source === 'yandex_maps') return 'Я.Карты';
  return source ?? '';
}

function buildSourceUrl(source: string | null | undefined, externalId: string | null | undefined): string | null {
  if (!externalId || !source) return null;
  if (source === '2gis') return `https://2gis.ru/firm/${externalId}`;
  if (source === 'yandex_maps') return `https://yandex.ru/maps/org/${externalId}`;
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
  city: string | null | undefined
): string | null {
  const a = (address ?? '').trim();
  const c = (city ?? '').trim();
  if (!a && !c) return null;
  if (!a) return c;
  if (!c) return a;
  if (a.toLowerCase().includes(c.toLowerCase())) return a;
  return `${c}, ${a}`;
}
