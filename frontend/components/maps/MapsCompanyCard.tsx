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

import {
  ExternalLink,
  ListPlus,
  Mail,
  MessageSquareQuote,
  Sparkles,
  Activity,
  Phone,
  Globe,
  Star,
  Flame,
  Briefcase,
  Calendar,
  MessageCircle,
} from 'lucide-react';

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
  /** Multi-source §3.2 ТЗ 2026-06-04: когда в шапке выбран фильтр
   *  «Только 2GIS» / «Только Я.Карты», карточка склеенной компании
   *  фокусирует превью на данных выбранного источника:
   *    - rating / reviews_count / reviews_negative_count / has_owner_replies
   *      берутся из sources_profiles[source]
   *    - phone / website / emails — из контактов выбранного профиля
   *    - бейдж выбранного источника подсвечен, второй приглушён
   *    - deeplink «открыть в …» ведёт на выбранный источник
   *  Если у компании только один профиль или activeSource='all'/undef —
   *  карточка рендерится как раньше (агрегированные плоские поля). */
  activeSource?: 'all' | '2gis' | 'yandex_maps' | null;
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
  // §3.2: фокус-профиль выбран только когда активен фильтр '2gis'/'yandex_maps'
  // И у компании реально несколько профилей (одноисточниковую карточку
  // фокусировать незачем — она и так показывает свой единственный источник).
  const focusedProfile =
    activeSource && activeSource !== 'all' && sourcesProfiles.length > 1
      ? sourcesProfiles.find((sp) => sp.source === activeSource) ?? null
      : null;

  // Контакты выбранного профиля (если есть): первое попавшееся значение каждого типа.
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

  // Single-source deeplink. При активном фильтре — на выбранный источник, иначе
  // на «основной» source компании (исторический).
  const singleSource = focusedProfile?.source ?? company.source;
  const singleExternalId = focusedProfile?.external_id ?? company.external_id;
  const sourceUrl =
    focusedProfile?.source_url ?? buildSourceUrl(singleSource, singleExternalId);
  const sourceTitle = sourceLabel(singleSource);
  // Multi-source (Phase 5): если у компании несколько источниковых профилей —
  // показываем мульти-бейдж «2GIS + Я.Карты». Иначе fallback на legacy single-source.
  // §3.2 ТЗ 2026-06-04: при активном source-фильтре выделяем выбранный бейдж.
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

      {/* Шапка v3: название слева, рейтинг справа крупно. Все остальные метрики
          (температура, website-score, возраст, отзывы, негатив, сайт, источники)
          — единым горизонтальным рядом ниже с иконками. Раньше плашки шли
          вертикальной колонкой справа + ещё одна строка снизу = визуальный
          хаос ("выглядит как черновик" — юзер 2026-06-09). */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] sm:text-[16px] font-semibold leading-snug tracking-tight text-[hsl(var(--text))] break-words line-clamp-2 sm:truncate">
            {company.name || '—'}
          </h3>
          {fullAddress && (
            <div className="mt-0.5 text-[12px] text-[hsl(var(--muted))] break-words line-clamp-2 sm:truncate sm:line-clamp-none">
              {fullAddress}
            </div>
          )}
        </div>
        {rating != null && <RatingPillV3 rating={Number(rating)} reviews={reviewsTotal} />}
      </div>

      {/* AI-анализ под выбранный пресет */}
      {aiAnalysis && <AiAnalysisRow analysis={aiAnalysis} />}

      {/* Единая строка метрик с иконками. Каждая чипа = одна метрика,
          одинаковый размер/радиус/паддинг. Скрываем нейтральные/нулевые
          (например, не показываем «0 негатив» или «есть сайт» — это шум). */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        {reviewsNeg > 0 && (
          <MetricChip
            tone={reviewsNeg >= 5 ? 'hot' : 'warm'}
            icon={<MessageCircle />}
            title="Негативных отзывов (1-3★ или sentiment=negative)"
          >
            {reviewsNeg} негатив
          </MetricChip>
        )}
        {ownerReplies === true && (
          <MetricChip
            tone="good"
            icon={<MessageSquareQuote />}
            title="Владелец отвечает на отзывы"
          >
            отвечает
          </MetricChip>
        )}
        {!hasWebsite && (
          <MetricChip
            tone="accent"
            icon={<Globe />}
            title="Нет сайта — горячий сигнал для продажи сайта"
          >
            нет сайта
          </MetricChip>
        )}
        {typeof company.lead_temperature === 'number' && company.lead_temperature > 0 && (
          <MetricChip
            tone={tempTone(company.lead_temperature)}
            icon={<Flame />}
            title="Температура лида: рейтинг × отзывы × свежесть × контакты × ответы"
          >
            {company.lead_temperature}
          </MetricChip>
        )}
        {typeof company.website_lead_score === 'number' && company.website_lead_score > 0 && (
          <MetricChip
            tone={tempTone(company.website_lead_score)}
            icon={<Briefcase />}
            title="Website-score: насколько компания — кандидат на продажу сайта"
          >
            {company.website_lead_score}
          </MetricChip>
        )}
        {company.legal && typeof company.legal.age_years === 'number' && (
          <MetricChip
            tone="cool"
            icon={<Calendar />}
            title={`ИНН ${company.legal.inn ?? '—'}${
              typeof company.legal.revenue === 'number' && company.legal.revenue > 0
                ? ` · оборот ₽${(company.legal.revenue / 1_000_000).toFixed(1)}М`
                : ''
            }`}
          >
            {company.legal.age_years}л
            {typeof company.legal.revenue === 'number' && company.legal.revenue > 0 && (
              <span className="ml-1 text-[hsl(var(--muted))]">
                · ₽{(company.legal.revenue / 1_000_000).toFixed(1)}М
              </span>
            )}
          </MetricChip>
        )}
        {/* Источники: компактный текст, не плашка — это просто метаинформация */}
        {multiSourceList.length > 0 ? (
          <span
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-[hsl(var(--muted))]"
            title={
              activeSource && activeSource !== 'all'
                ? `Фильтр: только ${sourceLabel(activeSource)}.`
                : 'Найдена в нескольких источниках'
            }
          >
            {multiSourceList.map((s, idx) => (
              <span key={s.source} className="inline-flex items-center gap-1">
                {idx > 0 && <span aria-hidden>·</span>}
                <span
                  className={
                    s.active
                      ? 'font-semibold text-brand-700 dark:text-brand-300'
                      : 'font-medium'
                  }
                >
                  {s.label}
                </span>
              </span>
            ))}
          </span>
        ) : (
          company.source && (
            <span className="ml-auto text-[11px] text-[hsl(var(--muted))]">{sourceTitle}</span>
          )
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
        {phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3 text-[hsl(var(--muted))]" />
            <a
              href={`tel:${phone}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-brand-600 hover:underline"
            >
              {phone}
            </a>
          </span>
        )}
        {hasWebsite && website && (
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3 text-[hsl(var(--muted))]" />
            <a
              href={normalizeUrl(website.trim())}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="max-w-[180px] truncate hover:text-brand-600 hover:underline"
            >
              {stripScheme(website.trim())}
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
        {multiSourceList.length > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1.5">
            {/* При активном source-фильтре прячем deeplink на «другой» источник —
                карточка сфокусирована на выбранном (§3.2). */}
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
                    className="inline-flex items-center gap-1 rounded-v2-sm border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--text))] hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400"
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
              className="ml-auto inline-flex items-center gap-1 rounded-v2-sm border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--text))] hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400"
              title={`Открыть карточку в ${sourceTitle}`}
            >
              <ExternalLink className="h-3 w-3" />
              {sourceTitle}
            </a>
          )
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

/** Крупный рейтинг-чип v3: ★ N.N с цветом по шкале + мелким «· N отзывов».
 *  Заменяет «4 плашки колонкой справа» — теперь в правом верхнем углу одна
 *  заметная плашка с главным сигналом (рейтинг). Остальные метрики
 *  переехали в единый горизонтальный ряд под названием. */
function RatingPillV3({ rating, reviews }: { rating: number; reviews: number }) {
  const color =
    rating >= 4.5 ? '#16a34a' : rating >= 4.0 ? '#ca8a04' : rating >= 3.5 ? '#ea580c' : '#dc2626';
  const bg =
    rating >= 4.5
      ? 'rgba(22, 163, 74, 0.10)'
      : rating >= 4.0
        ? 'rgba(202, 138, 4, 0.12)'
        : rating >= 3.5
          ? 'rgba(234, 88, 12, 0.12)'
          : 'rgba(220, 38, 38, 0.12)';
  return (
    <div
      className="flex shrink-0 flex-col items-end rounded-v2-sm px-2.5 py-1"
      style={{ background: bg }}
      title={`Рейтинг ${rating.toFixed(1)} · ${reviews} отзывов`}
    >
      <div className="flex items-center gap-1 leading-none" style={{ color }}>
        <Star className="h-3.5 w-3.5" fill={color} stroke={color} />
        <span className="text-[15px] font-bold tabular-nums">{rating.toFixed(1)}</span>
      </div>
      {reviews > 0 && (
        <div className="mt-0.5 text-[10px] leading-none text-[hsl(var(--muted))]">
          {reviews} {reviews === 1 ? 'отзыв' : reviews < 5 ? 'отзыва' : 'отзывов'}
        </div>
      )}
    </div>
  );
}

/** Унифицированный чип метрики: иконка + значение + (опционально) tone-цвет.
 *  Все метрики в одной строке выглядят одинаково = аккуратно. */
function MetricChip({
  tone,
  icon,
  children,
  title,
}: {
  tone: 'good' | 'warm' | 'hot' | 'muted' | 'cool' | 'accent';
  icon?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  const cls = (() => {
    switch (tone) {
      case 'good':
        return 'bg-[var(--signal-good-bg)] text-[color:var(--signal-good)] ring-[color:var(--signal-good)]/30';
      case 'warm':
        return 'bg-[var(--signal-warm-bg)] text-[color:var(--signal-warm)] ring-[color:var(--signal-warm)]/30';
      case 'hot':
        return 'bg-[var(--signal-hot-bg)] text-[color:var(--signal-hot)] ring-[color:var(--signal-hot)]/30';
      case 'cool':
        return 'bg-[var(--signal-cool-bg)] text-[color:var(--signal-cool)] ring-[color:var(--signal-cool)]/30';
      case 'accent':
        return 'bg-brand-500/10 text-brand-700 ring-brand-500/30 dark:text-brand-300';
      default:
        return 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted))] ring-[hsl(var(--border))]';
    }
  })();
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
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
  // v4: убираем шумный жёлтый bg и × N с обводкой. Теперь плитка —
  // тонкий outlined-chip как у профессиональных дашбордов (Linear, Notion).
  // Заголовок «Диагноз по отзывам» → «Темы из негативных отзывов» —
  // нейтральнее и точнее: AI кластеризует именно темы жалоб, а не ставит
  // компании диагноз. Цитата отзыва ниже остаётся в blockquote-стиле.
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[hsl(var(--muted))]">
        <Activity className="h-3 w-3 text-[hsl(var(--muted))]" />
        Темы из негативных отзывов
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pains.slice(0, 6).map((p) => (
          <span
            key={p.pain_tag_id}
            title={p.description ?? p.label}
            className="inline-flex items-center gap-1.5 rounded-v2-sm border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[11.5px] text-[hsl(var(--text))] hover:border-[color:var(--signal-warm)]/50 transition-colors"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[color:var(--signal-warm)]/70"
              aria-hidden
            />
            <span className="leading-tight">{p.label}</span>
            {p.mention_count > 1 && (
              <span className="text-[10px] tabular-nums text-[hsl(var(--muted))]">
                {p.mention_count}
              </span>
            )}
          </span>
        ))}
      </div>
      {pains[0]?.top_quote && (
        <div className="flex items-start gap-2 border-l-2 border-[hsl(var(--border))] pl-2.5 text-[12.5px] leading-snug text-[hsl(var(--muted))]">
          <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--muted))]" />
          <span className="line-clamp-2 italic">«{pains[0].top_quote}»</span>
        </div>
      )}
    </div>
  );
}

function NegativeSnippetsBlock({ snippets }: { snippets: string[] }) {
  // v3: компактный блок цитат без больших розовых плашек. Заголовок
  // мягче, цитаты — серый левый бордер вместо bg-fill (как blockquote
  // в gmail/notion), не давит карточку.
  return (
    <div className="mt-3 space-y-1.5">
      <div
        className="flex items-center gap-1.5 text-[11px] font-medium text-[hsl(var(--muted))]"
        title="AI ещё не разобрал боли — показаны фрагменты негативных отзывов"
      >
        <Activity className="h-3 w-3" />
        <span>Фрагменты негативных отзывов</span>
        <span className="rounded-pill bg-[hsl(var(--surface-2))] px-1.5 py-0.5 text-[10px] font-normal">
          AI ещё считает
        </span>
      </div>
      {snippets.slice(0, 2).map((quote, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 border-l-2 border-[color:var(--signal-hot)]/40 pl-2.5 text-[12.5px] leading-snug text-[hsl(var(--text))]"
        >
          <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--signal-hot)]/70" />
          <span className="line-clamp-2 italic">«{quote}»</span>
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
  if (source === 'google_maps') return 'Google Maps';
  return source ?? '';
}

function buildSourceUrl(source: string | null | undefined, externalId: string | null | undefined): string | null {
  if (!externalId || !source) return null;
  if (source === '2gis') return `https://2gis.ru/firm/${externalId}`;
  if (source === 'yandex_maps') return `https://yandex.ru/maps/org/${externalId}`;
  if (source === 'google_maps') return `https://www.google.com/maps/place/?q=place_id:${externalId}`;
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
