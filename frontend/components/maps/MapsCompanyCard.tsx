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

import { ExternalLink, Globe, ListPlus, Mail, MessageSquareQuote, Phone, Sparkles } from 'lucide-react';

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
  /** Результат AI-анализа компании под активный пресет (если применён
   *  пресет с ai_prompt). */
  aiAnalysis?: CompanyAnalysisOut | null;
  /** Bulk-выбор: показать чекбокс и состояние selected. Передаётся из
   *  MapsSearchResults, если включён режим массового выбора. */
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
  const ratingBadgeClass = ratingClass(company.rating);
  const emails = Array.isArray(company.emails) ? company.emails : [];
  const topPains = Array.isArray(company.top_pains) ? company.top_pains : [];
  const negativeSnippets = Array.isArray(company.negative_snippets) ? company.negative_snippets : [];
  const fullAddress = formatAddressWithCity(company.address, company.city);
  // website считаем валидным только если непустая строка после trim.
  // 2GIS иногда отдаёт " " или "" — без trim фронт показывал «есть сайт» там,
  // где на самом деле сайта нет (и бэк-фильтр has_website=true их пропускал).
  const hasWebsite = typeof company.website === 'string' && company.website.trim().length > 0;
  const fallbackTags =
    topPains.length === 0 && Array.isArray(company.pain_tags) ? company.pain_tags : [];

  // Deeplink в карточку источника — кнопка «2GIS» / «Я.Карты» прямо в превью.
  // Юзер просил видеть контакты сразу: на нашем тарифе 2GIS Catalog API
  // contact_groups не всегда отдаёт, но из своей же карточки 2GIS юзер их
  // увидит за один клик.
  const sourceUrl = buildSourceUrl(company.source, company.external_id);

  return (
    <li
      className={cn(
        'relative px-4 py-3 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
        selected && 'bg-emerald-50/60 dark:bg-emerald-900/20',
        onClick ? 'cursor-pointer' : 'cursor-default',
        onToggleSelect && id != null && 'pl-9'
      )}
    >
      {/* Чекбокс bulk-выбора абсолютно позиционирован — не ломает внутреннюю
          структуру карточки. Кликом не открываем drawer (stopPropagation). */}
      {onToggleSelect && id != null && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect(id)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Выбрать компанию"
          className="absolute left-3 top-3.5 h-4 w-4 cursor-pointer accent-emerald-600"
        />
      )}
      <div
        className="flex items-start justify-between gap-3"
        onClick={onClick}
        role={onClick ? 'button' : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-900 dark:text-slate-100">{company.name || '—'}</div>
          {fullAddress && (
            <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{fullAddress}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {company.rating != null && (
            <span className={cn('app-badge', ratingBadgeClass)}>
              ★ {Number(company.rating).toFixed(1)}
            </span>
          )}
          {/* Бейдж lead_temperature (блок 3 ТЗ). Показываем только когда
              значение посчитано (после первого пересчёта). Цвет — по диапазону. */}
          {typeof company.lead_temperature === 'number' && (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                temperatureClass(company.lead_temperature)
              )}
              title="Температура лида: связка рейтинг + отзывы + свежесть + контакты"
            >
              🔥 {company.lead_temperature}
            </span>
          )}
          {/* Бейдж website_lead_score (блок 4 ТЗ). Показываем когда есть
              значение (NULL = компания с собственным сайтом, ей продавать
              сайт нечего — бейдж не показываем). */}
          {typeof company.website_lead_score === 'number' && (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                temperatureClass(company.website_lead_score)
              )}
              title="Website-lead score: «нет сайта + бизнес живой» — кандидат на продажу сайта"
            >
              💼 {company.website_lead_score}
            </span>
          )}
          {/* Юр.данные из DaData (блок 2 ТЗ). Показываем оборот + возраст
              если есть. Признак платёжеспособности. */}
          {company.legal && (typeof company.legal.revenue === 'number' || typeof company.legal.age_years === 'number') && (
            <span
              className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800 ring-1 ring-inset ring-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:ring-blue-700/50"
              title={`ИНН: ${company.legal.inn ?? '—'} · ${company.legal.legal_short_name ?? company.legal.legal_name ?? ''}`}
            >
              {typeof company.legal.revenue === 'number' && company.legal.revenue > 0
                ? `₽ ${(company.legal.revenue / 1_000_000).toFixed(1)}М`
                : ''}
              {typeof company.legal.revenue === 'number' && company.legal.revenue > 0 && typeof company.legal.age_years === 'number' ? ' · ' : ''}
              {typeof company.legal.age_years === 'number' ? `${company.legal.age_years}л` : ''}
            </span>
          )}
        </div>
      </div>

      {aiAnalysis && (
        <div
          className={cn(
            'mt-1.5 inline-flex items-start gap-1.5 rounded-md px-2 py-1 text-[11px]',
            aiAnalysis.status === 'done' && aiAnalysis.score != null
              ? aiAnalysis.score >= 7
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200'
                : aiAnalysis.score >= 4
                  ? 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              : aiAnalysis.status === 'pending'
                ? 'border border-violet-200 bg-violet-50 text-violet-800 animate-pulse dark:border-violet-700/50 dark:bg-violet-900/30 dark:text-violet-200'
                : 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-200'
          )}
          title={aiAnalysis.comment ?? aiAnalysis.error ?? ''}
        >
          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
          {aiAnalysis.status === 'pending' ? (
            <span>AI: считаю…</span>
          ) : aiAnalysis.status === 'failed' ? (
            <span>AI: ошибка</span>
          ) : (
            <>
              <span className="font-semibold">AI: {aiAnalysis.score ?? '—'}/10</span>
              {aiAnalysis.comment && (
                <span className="line-clamp-2 italic">{aiAnalysis.comment}</span>
              )}
            </>
          )}
        </div>
      )}

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

      {/* Контакты в превью. Если ничего нет от провайдера — всё равно
          показываем ссылку «открыть в 2GIS» как минимальный contact-fallback,
          чтобы юзер мог за один клик увидеть телефон/мессенджеры в источнике. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600 dark:text-slate-300">
        {company.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3 text-slate-400 dark:text-slate-500" />
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
            <Globe className="h-3 w-3 text-slate-400 dark:text-slate-500" />
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
              className="text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {emails[0]}
            </a>
            {emails.length > 1 && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">+{emails.length - 1}</span>
            )}
          </span>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
            title={`Открыть карточку в ${sourceLabel(company.source)}`}
          >
            <ExternalLink className="h-3 w-3" />
            {sourceLabel(company.source)}
          </a>
        )}
      </div>

      {topPains.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {topPains.slice(0, 3).map((p) => (
            <div
              key={p.pain_tag_id}
              className="rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5 dark:border-amber-700/50 dark:bg-amber-900/20"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-700/40 dark:text-amber-200">
                  {p.label}
                </span>
                {p.mention_count > 0 && (
                  <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                    × {p.mention_count}
                  </span>
                )}
              </div>
              {p.top_quote && (
                <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-700 dark:text-slate-200">
                  <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <span className="line-clamp-2 italic">«{p.top_quote}»</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : negativeSnippets.length > 0 ? (
        // Fallback: AI ещё не разобрал боли, но у компании есть негативы —
        // показываем 1-2 куска отзыва напрямую, чтобы юзер сразу видел причину
        // негатива. Иначе карточка выглядит «пустой» с цифрой «негатив 8» без сути.
        <div className="mt-2 space-y-1.5">
          {negativeSnippets.slice(0, 2).map((quote, idx) => (
            <div
              key={idx}
              className="rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1.5 dark:border-rose-700/50 dark:bg-rose-900/20"
              title="AI ещё не разобрал боли клиентов — показан кусок негативного отзыва как есть"
            >
              <div className="flex items-start gap-1.5 text-[12px] text-slate-700 dark:text-slate-200">
                <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                <span className="line-clamp-2 italic">«{quote}»</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        fallbackTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {fallbackTags.slice(0, 5).map((t: PainTagShort) => (
              <span
                key={t.id}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-700 dark:text-slate-200"
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
              // min-h-9 (36px) = разумный тач-таргет на mobile. На sm+ возвращаем
              // плотную высоту, чтобы карточка не разъезжалась.
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:min-h-0 sm:px-2.5 sm:py-1"
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
                'inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white sm:min-h-0 sm:px-2.5 sm:py-1',
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
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-700/50',
    warn: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-700/50',
    danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-700/50',
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

/** Цвет бейджа температуры лида 0-100.
 *  70+ — горячий (красный), 40-69 — тёплый (жёлтый), 0-39 — холодный (серый).
 *  Шкала из ТЗ блока 3 (2026-06-02). */
function temperatureClass(t: number): string {
  if (t >= 70) {
    return 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:ring-rose-700/50';
  }
  if (t >= 40) {
    return 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-700/50';
  }
  return 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700';
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
  // Если город уже в адресе (нечувствительно к регистру) — не дублируем.
  if (a.toLowerCase().includes(c.toLowerCase())) return a;
  return `${c}, ${a}`;
}
