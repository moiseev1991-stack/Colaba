'use client';

/**
 * MapsCompanyCard v5 — Pipedrive/Salesforce-inspired corporate deal-card.
 *
 * Что изменилось от v4 (2026-06-10):
 *   - Левый цветной status-bar (4px) по приоритету лида: hot/warm/cool —
 *     как deal stage в Pipedrive.
 *   - Плоские status pills без полупрозрачности, ring и gradient. Solid
 *     цвет + чёткий border = "корпоративный B2B" вместо glassmorphism.
 *   - Pain-tags: серый фон с тонким border, без orange. Точка-индикатор
 *     по типу боли (cosmetic).
 *   - Quote-block: толстый left border + тёмный italic, как blockquote
 *     в Salesforce Lightning.
 *   - Actions: solid primary fill (без бренд-градиента), secondary outline.
 *   - Шапка: numeric rating слева от звезды (Pipedrive deal-value-style),
 *     без цветного chip-bg.
 *
 * Сохранена бизнес-логика: focusedProfile, multiSourceList, bulk-чекбокс,
 * AI analysis row, контакты, deeplinks.
 */

import {
  ExternalLink,
  ListPlus,
  Mail,
  MessageSquareQuote,
  Sparkles,
  Phone,
  Globe,
  Star,
  Calendar,
  MessageCircle,
  UserCheck,
  UserX,
} from 'lucide-react';

import { cn } from '@/lib/utils';
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
  activeSource,
}: Props) {
  const id = company.id ?? company.company_id;
  const sourcesProfiles = Array.isArray(company.sources_profiles) ? company.sources_profiles : [];
  const focusedProfile =
    activeSource && activeSource !== 'all' && sourcesProfiles.length > 1
      ? sourcesProfiles.find((sp) => sp.source === activeSource) ?? null
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
  const topPains = Array.isArray(company.top_pains) ? company.top_pains : [];
  const negativeSnippets = Array.isArray(company.negative_snippets) ? company.negative_snippets : [];
  const fullAddress = formatAddressWithCity(company.address, company.city);
  const hasWebsite = typeof website === 'string' && website.trim().length > 0;
  const fallbackTags =
    topPains.length === 0 && Array.isArray(company.pain_tags) ? company.pain_tags : [];

  const singleSource = focusedProfile?.source ?? company.source;
  const singleExternalId = focusedProfile?.external_id ?? company.external_id;
  const sourceUrl =
    focusedProfile?.source_url ?? buildSourceUrl(singleSource, singleExternalId);
  const sourceTitle = sourceLabel(singleSource);

  const multiSourceList: {
    source: string;
    label: string;
    url: string | null;
    active: boolean;
  }[] =
    sourcesProfiles.length > 1
      ? sourcesProfiles.map((sp) => ({
          source: sp.source,
          label: sourceLabel(sp.source),
          url: sp.source_url ?? buildSourceUrl(sp.source, sp.external_id),
          active: !!activeSource && activeSource !== 'all' && sp.source === activeSource,
        }))
      : [];

  // Pipedrive deal-stage цвет: главный сигнал приоритета лида.
  // hot — горящий лид (много негатива и/или высокая температура).
  // warm — средний интерес.
  // cool — холодный/нейтральный.
  const stageTone: 'hot' | 'warm' | 'cool' = (() => {
    const temp = typeof company.lead_temperature === 'number' ? company.lead_temperature : 0;
    if (reviewsNeg >= 5 || temp >= 70) return 'hot';
    if (reviewsNeg >= 1 || temp >= 40) return 'warm';
    return 'cool';
  })();
  const stageBarCls =
    stageTone === 'hot'
      ? 'bg-rose-500'
      : stageTone === 'warm'
        ? 'bg-amber-500'
        : 'bg-slate-300 dark:bg-slate-600';

  return (
    <li
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      className={cn(
        'group relative flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition-colors',
        'dark:border-slate-700 dark:bg-slate-900',
        onClick && 'cursor-pointer hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-800/60',
        selected && 'ring-2 ring-blue-500/60 ring-offset-1 dark:ring-offset-slate-900'
      )}
    >
      {/* Left status bar — главный сигнал «горящий лид» в Pipedrive-стиле */}
      <div
        aria-hidden
        className={cn('w-1 shrink-0', stageBarCls)}
        title={
          stageTone === 'hot'
            ? 'Горящий лид: много негатива или высокая температура'
            : stageTone === 'warm'
              ? 'Средний приоритет'
              : 'Холодный/нейтральный лид'
        }
      />

      <div className={cn('flex min-w-0 flex-1 flex-col gap-2.5 p-4', onToggleSelect && id != null && 'pl-9')}>
        {onToggleSelect && id != null && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect(id)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Выбрать компанию"
            className="absolute left-4 top-4 h-4 w-4 cursor-pointer accent-blue-600"
          />
        )}

        {/* Шапка: название + рейтинг (numeric, Pipedrive deal-value style) */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-slate-900 dark:text-slate-100">
              {company.name || '—'}
            </h3>
            {fullAddress && (
              <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
                {fullAddress}
              </div>
            )}
          </div>
          {rating != null && (
            <div
              className="flex shrink-0 flex-col items-end leading-tight"
              title={`Рейтинг ${Number(rating).toFixed(1)} · ${reviewsTotal} отзывов`}
            >
              <div className="flex items-center gap-1 text-slate-900 dark:text-slate-100">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="text-[15px] font-bold tabular-nums">{Number(rating).toFixed(1)}</span>
              </div>
              {reviewsTotal > 0 && (
                <div className="mt-0.5 text-[10.5px] tabular-nums text-slate-500 dark:text-slate-400">
                  {reviewsTotal} {reviewsTotal === 1 ? 'отзыв' : reviewsTotal < 5 ? 'отзыва' : 'отзывов'}
                </div>
              )}
            </div>
          )}
        </div>

        {aiAnalysis && <AiAnalysisRow analysis={aiAnalysis} />}

        {/* Meta-строка: flat status pills, Pipedrive-стиль */}
        <div className="flex flex-wrap items-center gap-1.5">
          {reviewsNeg > 0 && (
            <StatusPill
              tone={reviewsNeg >= 5 ? 'hot' : 'warm'}
              icon={<MessageCircle />}
              title="Негативных отзывов (1-3★ или sentiment=negative)"
            >
              {reviewsNeg} негатив
            </StatusPill>
          )}
          {ownerReplies === true && (
            <StatusPill tone="good" icon={<MessageSquareQuote />} title="Владелец отвечает на отзывы">
              отвечает
            </StatusPill>
          )}
          {!hasWebsite && (
            <StatusPill
              tone="accent"
              icon={<Globe />}
              title="Нет сайта — горячий сигнал для продажи сайта"
            >
              нет сайта
            </StatusPill>
          )}
          {/* 2026-06-19: тип юр.лица из DaData (data.opf.short).
              Помогает быстро отделить ИП от ООО на глаз без открытия
              drawer'а — полезно для сегментации (ИП = чаще принимает
              решения сам, ООО = нужен ЛПР). */}
          {company.legal?.opf && (
            <StatusPill
              tone="neutral"
              title={
                company.legal.legal_short_name
                  ? `${company.legal.legal_short_name}${company.legal.inn ? ` · ИНН ${company.legal.inn}` : ''}`
                  : `Тип юр.лица: ${company.legal.opf}`
              }
            >
              {company.legal.opf}
            </StatusPill>
          )}
          {/* 2026-06-12: pill «ЛПР». has_lpr приходит с бэка — true если есть
              director_name из DaData или хотя бы один decision_maker со страниц
              сайта. Зелёный значок «есть», серый «нет данных» — чтобы юзер
              видел разницу «не нашлось» от «не загружено». */}
          {company.has_lpr === true && (
            <StatusPill
              tone="good"
              icon={<UserCheck />}
              title="ЛПР известен (DaData или со страницы /team)"
            >
              ЛПР есть
            </StatusPill>
          )}
          {company.has_lpr === false && (
            <StatusPill
              tone="neutral"
              icon={<UserX />}
              title="ЛПР не найден ни в DaData, ни на сайте"
            >
              ЛПР: нет данных
            </StatusPill>
          )}
          {/* 2026-06-12: убраны pill'ы lead_temperature и website_lead_score.
              Юзер: «не понимаю смысла этих 65/66, зачем они нам». Сами
              скоры остаются в БД и применяются в сортировках/фильтрах —
              просто не дублируют визуал карточки. */}
          {company.legal && typeof company.legal.age_years === 'number' && (
            <StatusPill
              tone="neutral"
              icon={<Calendar />}
              title={`ИНН ${company.legal.inn ?? '—'}${
                typeof company.legal.revenue === 'number' && company.legal.revenue > 0
                  ? ` · оборот ₽${(company.legal.revenue / 1_000_000).toFixed(1)}М`
                  : ''
              }`}
            >
              {company.legal.age_years}л
              {typeof company.legal.revenue === 'number' && company.legal.revenue > 0 && (
                <span className="ml-1 text-slate-500 dark:text-slate-400">
                  · ₽{(company.legal.revenue / 1_000_000).toFixed(1)}М
                </span>
              )}
            </StatusPill>
          )}
          {multiSourceList.length > 0 ? (
            <span
              className="ml-auto text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400"
              title={
                activeSource && activeSource !== 'all'
                  ? `Фильтр: только ${sourceLabel(activeSource)}.`
                  : 'Найдена в нескольких источниках'
              }
            >
              {multiSourceList.map((s, idx) => (
                <span key={s.source}>
                  {idx > 0 && <span aria-hidden className="mx-1">·</span>}
                  <span
                    className={cn(
                      s.active && 'font-semibold text-blue-700 dark:text-blue-300'
                    )}
                  >
                    {s.label}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            company.source && (
              <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">
                {sourceTitle}
              </span>
            )
          )}
        </div>

        {/* Зона диагноза: pain-tags или fallback */}
        {topPains.length > 0 ? (
          <PainBlock pains={topPains} />
        ) : negativeSnippets.length > 0 ? (
          <NegativeSnippetsBlock snippets={negativeSnippets} />
        ) : (
          fallbackTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {fallbackTags.slice(0, 5).map((t: PainTagShort) => (
                <span
                  key={t.id}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11.5px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {t.label}
                </span>
              ))}
            </div>
          )
        )}

        {/* Контакты */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          {phone && (
            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
              <Phone className="h-3 w-3 text-slate-400" />
              <a
                href={`tel:${phone}`}
                onClick={(e) => e.stopPropagation()}
                className="tabular-nums hover:text-blue-600 hover:underline dark:hover:text-blue-400"
              >
                {phone}
              </a>
            </span>
          )}
          {hasWebsite && website && (
            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
              <Globe className="h-3 w-3 text-slate-400" />
              <a
                href={normalizeUrl(website.trim())}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="max-w-[180px] truncate hover:text-blue-600 hover:underline dark:hover:text-blue-400"
              >
                {stripScheme(website.trim())}
              </a>
            </span>
          )}
          {emails.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <a
                href={`mailto:${emails[0]}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                {emails[0]}
              </a>
              {emails.length > 1 && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  +{emails.length - 1}
                </span>
              )}
            </span>
          )}
          {multiSourceList.length > 0 ? (
            <span className="ml-auto inline-flex items-center gap-1.5">
              {multiSourceList
                .filter((s) => !activeSource || activeSource === 'all' || s.active)
                .map((s) =>
                  s.url ? (
                    <a
                      key={s.source}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-300"
                      title={`Открыть карточку в ${s.label}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {s.label}
                    </a>
                  ) : null,
                )}
            </span>
          ) : (
            sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                title={`Открыть карточку в ${sourceTitle}`}
              >
                <ExternalLink className="h-3 w-3" />
                {sourceTitle}
              </a>
            )
          )}
        </div>

        {/* Actions: solid primary + outline secondary, Pipedrive flat */}
        {!hideActions && (onAddToList || onDraftEmail) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {onAddToList && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToList(company);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ListPlus className="h-4 w-4" />В список
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
                title={
                  topPains.length === 0
                    ? 'Сгенерировать общее КП по шаблону (у компании ещё нет проанализированных болей в отзывах)'
                    : 'Сгенерировать КП под боль клиентов из отзывов'
                }
                className="inline-flex h-9 items-center gap-1.5 rounded bg-violet-600 px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-600"
              >
                <Sparkles className="h-4 w-4" />
                {draftEmailLoading ? 'Готовлю…' : 'КП'}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/* ===== Sub-components ===== */

/** Plain status pill — Pipedrive-style: solid bg, contrast text, no ring/blur. */
function StatusPill({
  tone,
  icon,
  children,
  title,
}: {
  tone: 'good' | 'warm' | 'hot' | 'neutral' | 'cool' | 'accent';
  icon?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  const cls = (() => {
    switch (tone) {
      case 'good':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200';
      case 'warm':
        return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200';
      case 'hot':
        return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200';
      case 'cool':
        return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-900/30 dark:text-sky-200';
      case 'accent':
        return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-200';
      default:
        return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200';
    }
  })();
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11.5px] font-medium leading-tight',
        cls,
      )}
    >
      {icon && (
        <span className="inline-flex h-3 w-3 items-center justify-center [&_svg]:h-3 [&_svg]:w-3">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

function PainBlock({ pains }: { pains: CompanyPainOut[] }) {
  // Дедупликация по нормализованному label. На прод-данных бывают почти-дубли
  // («Качество услуг», «Качество услуг и цены», «Качество оказанных услуг») —
  // их три раза подряд показывать визуально бессмысленно.
  const seen = new Set<string>();
  const unique = pains.filter((p) => {
    const key = (p.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <div className="space-y-2 rounded border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Боли клиентов из отзывов
      </div>
      <div className="flex flex-wrap gap-1.5">
        {unique.slice(0, 5).map((p) => (
          <span
            key={p.pain_tag_id}
            title={p.description ?? p.label}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11.5px] font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
            <span className="leading-tight">{p.label}</span>
            {p.mention_count > 1 && (
              <span className="rounded-sm bg-slate-100 px-1 text-[10px] tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {p.mention_count}
              </span>
            )}
          </span>
        ))}
      </div>
      {pains[0]?.top_quote && (
        <div className="border-l-2 border-rose-400 bg-white pl-2.5 py-1 text-[12.5px] italic leading-snug text-slate-700 dark:border-rose-500 dark:bg-slate-900 dark:text-slate-200">
          «{pains[0].top_quote}»
        </div>
      )}
    </div>
  );
}

function NegativeSnippetsBlock({ snippets }: { snippets: string[] }) {
  return (
    <div className="space-y-1.5 rounded border border-amber-200 bg-amber-50/60 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
        <span>Фрагменты негативных отзывов</span>
        <span className="rounded-sm border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-amber-900 dark:border-amber-700 dark:bg-amber-800/50 dark:text-amber-100">
          AI считает
        </span>
      </div>
      {snippets.slice(0, 2).map((quote, idx) => (
        <div
          key={idx}
          className="border-l-2 border-amber-500 bg-white pl-2.5 py-1 text-[12.5px] italic leading-snug text-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          «{quote}»
        </div>
      ))}
    </div>
  );
}

function AiAnalysisRow({ analysis }: { analysis: CompanyAnalysisOut }) {
  const tone: 'good' | 'warm' | 'neutral' | 'hot' =
    analysis.status === 'pending'
      ? 'neutral'
      : analysis.status === 'failed'
        ? 'hot'
        : (analysis.score ?? 0) >= 7
          ? 'good'
          : (analysis.score ?? 0) >= 4
            ? 'warm'
            : 'neutral';

  return (
    <StatusPill tone={tone} icon={<Sparkles />} title={analysis.comment ?? analysis.error ?? ''}>
      {analysis.status === 'pending' ? (
        'AI: считаю…'
      ) : analysis.status === 'failed' ? (
        'AI: ошибка'
      ) : (
        <>
          AI: {analysis.score ?? '—'}/10
          {analysis.comment ? ` · ${analysis.comment.slice(0, 60)}` : ''}
        </>
      )}
    </StatusPill>
  );
}

/* ===== Utils ===== */

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
