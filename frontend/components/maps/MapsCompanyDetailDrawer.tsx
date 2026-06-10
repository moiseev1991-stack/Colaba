'use client';

/**
 * Подробный диалог компании: метрики, сайт/телефон, отзывы.
 *
 * Drawer фильтрации отзывов:
 *  - вкладки sentiment (все / негатив / позитив)
 *  - текстовый поиск (text_contains)
 *  - фильтр «только с ответом владельца»
 *
 * Карточки отзывов:
 *  - звёздный рейтинг
 *  - цветная боковая полоска по sentiment (красная/зелёная/серая)
 *  - бейджи sentiment и ответа владельца
 *  - подсветка совпадений с поисковой подстрокой
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  Globe,
  Mail,
  MessageCircle,
  Phone,
  Search as SearchIcon,
  Send,
  Star,
  X,
} from 'lucide-react';

import { CompanyDigestBlock } from '@/components/maps/CompanyDigestBlock';
import { NegativeTrendBadge } from '@/components/maps/NegativeTrendBadge';
import { OutreachDraftBlock } from '@/components/maps/OutreachDraftBlock';
import { PainBenchmarkBlock } from '@/components/maps/PainBenchmarkBlock';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  getCompanyDetail,
  getCompanyPainTrend,
  getCompanyReviews,
  type CompanyDetailOut,
  type DecisionMakerOut,
  type PainTrendOut,
  type ReviewOut,
} from '@/src/services/api/maps';

type Tab = 'all' | 'negative' | 'positive';
type SourceTab = 'all' | '2gis' | 'yandex_maps';

interface Props {
  companyId: number | null;
  onClose: () => void;
}

export function MapsCompanyDetailDrawer({ companyId, onClose }: Props) {
  const [detail, setDetail] = useState<CompanyDetailOut | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  // Phase 5 multi-source: вкладка по источнику. Активна (видна) только если
  // у компании 2+ источниковых профиля. 'all' = без фильтра.
  const [sourceTab, setSourceTab] = useState<SourceTab>('all');
  const [reviews, setReviews] = useState<ReviewOut[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Юзер 2026-06-10: клик по pain-плитке → фильтр reviews + chart + диапазон
  // дат. Когда null — обычный режим, плитки не активны как фильтр.
  const [activePainTagId, setActivePainTagId] = useState<number | null>(null);
  const [activePainLabel, setActivePainLabel] = useState<string>('');
  const [painTrend, setPainTrend] = useState<PainTrendOut | null>(null);

  // drawer-level фильтры (применяются к /maps/companies/{id}/reviews)
  const [textQuery, setTextQuery] = useState('');
  const [onlyWithOwnerReply, setOnlyWithOwnerReply] = useState(false);

  // debounce для текстового поиска (300мс)
  const [debouncedText, setDebouncedText] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(textQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [textQuery]);

  const loadReviews = useCallback(async () => {
    if (companyId == null || !detail) return;
    setIsLoading(true);
    try {
      const data = await getCompanyReviews(
        companyId,
        {
          ...(tab === 'all' ? {} : { sentiment: tab }),
          ...(debouncedText ? { text_contains: debouncedText } : {}),
          ...(onlyWithOwnerReply ? { has_owner_reply: true } : {}),
          ...(sourceTab !== 'all' ? { source: sourceTab } : {}),
          ...(activePainTagId != null ? { pain_tag_id: activePainTagId } : {}),
        },
        50,
        0,
      );
      setReviews(data.items);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, detail, tab, debouncedText, onlyWithOwnerReply, sourceTab, activePainTagId]);

  // Сбрасываем состояние при смене компании
  useEffect(() => {
    if (companyId == null) {
      setDetail(null);
      setReviews([]);
      setTab('all');
      setSourceTab('all');
      setTextQuery('');
      setDebouncedText('');
      setOnlyWithOwnerReply(false);
      setActivePainTagId(null);
      setActivePainLabel('');
      setPainTrend(null);
      return;
    }
    setIsLoading(true);
    void (async () => {
      try {
        const d = await getCompanyDetail(companyId);
        setDetail(d);
        setReviews(d.recent_reviews);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [companyId]);

  // Любая смена фильтра — повторный fetch
  useEffect(() => {
    if (companyId == null || !detail) return;
    // Дефолт «Все» без фильтров — используем уже загруженный recent_reviews,
    // не делаем лишний запрос.
    if (
      tab === 'all' && !debouncedText && !onlyWithOwnerReply && sourceTab === 'all'
      && activePainTagId == null
    ) {
      setReviews(detail.recent_reviews);
      return;
    }
    void loadReviews();
  }, [tab, debouncedText, onlyWithOwnerReply, sourceTab, activePainTagId, companyId, detail, loadReviews]);

  // Fetch chart-данных по выбранной боли (диапазон дат + помесячный count
  // по источникам). Перезапрашиваем при смене sourceTab чтобы chart
  // соответствовал текущему source-фильтру.
  useEffect(() => {
    if (companyId == null || activePainTagId == null) {
      setPainTrend(null);
      return;
    }
    let mounted = true;
    const sourceArg = sourceTab === 'all' ? undefined : sourceTab;
    getCompanyPainTrend(companyId, activePainTagId, sourceArg)
      .then((d) => {
        if (mounted) setPainTrend(d);
      })
      .catch(() => {
        if (mounted) setPainTrend(null);
      });
    return () => {
      mounted = false;
    };
  }, [companyId, activePainTagId, sourceTab]);

  const open = companyId != null;
  const hasActiveFilters =
    tab !== 'all' || sourceTab !== 'all' || debouncedText.length > 0 || onlyWithOwnerReply;
  // Phase 5: показываем вкладку «По источнику» только если у компании ≥2 профиля.
  const sourcesProfiles = detail?.sources_profiles ?? [];
  const showSourceTabs = sourcesProfiles.length >= 2;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={detail?.name ?? 'Загрузка…'}
      position="right"
    >
      {!detail ? (
        <div className="py-6 text-sm text-slate-500 dark:text-slate-400">Загружаем карточку…</div>
      ) : (
        <div className="space-y-4">
          {/* === Шапка компании === */}
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {formatAddressWithCity(detail.address, detail.city) || '—'}
          </div>

          {/* Phase 5 multi-source: метрики и контакты по каждому источнику раздельно.
              Одноисточниковые компании fall-back на старый ContactsBlock без секций. */}
          {showSourceTabs ? (
            <>
              <SourceMetricsBlock profiles={sourcesProfiles} />
              <MultiSourceContactsBlock profiles={sourcesProfiles} />
            </>
          ) : (
            <ContactsBlock detail={detail} />
          )}

          {/* Юр.данные из DaData (блок 2 ТЗ). Показываем только если матч найден. */}
          <LegalBlock legal={detail.legal} />

          {/* ЛПР со страниц сайта (ТЗ A.2 2026-06-04). Если decision_makers
              пуст и legal.director_name тоже null — блок не рендерится. */}
          <DecisionMakersBlock
            decisionMakers={detail.decision_makers ?? []}
          />

          {/* Aha-moment блок 1: драфт холодного письма по компании */}
          <OutreachDraftBlock
            companyId={detail.id}
            companyEmails={detail.emails ?? []}
          />

          <div className="flex flex-wrap gap-3 text-xs">
            <Metric label="Рейтинг" value={detail.rating?.toFixed(1) ?? '—'} />
            <Metric label="Отзывов" value={String(detail.reviews_count)} />
            <Metric label="Негатив" value={String(detail.reviews_negative_count)} red />
            <Metric label="Позитив" value={String(detail.reviews_positive_count)} green />
            <Metric
              label="Ответы владельца"
              value={detail.has_owner_replies ? `да (${detail.owner_replies_count})` : 'нет'}
            />
          </div>

          {/* §3 ТЗ 2026-06-10: «негатив растёт» — сигнал «писать сейчас». */}
          <div className="flex flex-wrap gap-2">
            <NegativeTrendBadge companyId={detail.id} />
          </div>

          {/* Дайджест за 30 дней — лента метрик + кликабельные топ-боли.
              Клик по плитке боли → activePainTagId → ниже появляется
              PainTrendBlock (даты + chart) + reviews-список фильтруется. */}
          <CompanyDigestBlock
            companyId={detail.id}
            days={30}
            activePainTagId={activePainTagId}
            onPainClick={(painTagId, label) => {
              if (painTagId === -1 || activePainTagId === painTagId) {
                setActivePainTagId(null);
                setActivePainLabel('');
                setPainTrend(null);
              } else {
                setActivePainTagId(painTagId);
                setActivePainLabel(label);
                setTab('all');
              }
            }}
          />
          {activePainTagId != null && painTrend && (
            <PainTrendBlock
              trend={painTrend}
              label={activePainLabel}
              hasSourceTabs={showSourceTabs}
              sourceTab={sourceTab}
            />
          )}

          {/* §1 ТЗ 2026-06-10: профиль болей компании vs средние по нише+городу.
              Аргумент в письме лиду + база для будущих платных отчётов. */}
          <PainBenchmarkBlock companyId={detail.id} />

          {/* Полный список pain_tags компании — выводим как нейтральные
              metadata-чипы (не кликабельные). Главный clickable-UX живёт
              выше в CompanyDigestBlock (Топ-3 за 30 дней) — два кликабельных
              блока со одним и тем же эффектом сбивают с толку. */}
          {Array.isArray(detail.pain_tags) && detail.pain_tags.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Все темы болей компании
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const seen = new Set<string>();
                  return detail.pain_tags.filter((t) => {
                    const k = (t.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
                    if (!k || seen.has(k)) return false;
                    seen.add(k);
                    return true;
                  });
                })().map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11.5px] text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* === Tabs по источнику (Phase 5 multi-source) === */}
          {showSourceTabs && (
            <div className="mb-1 flex gap-2 border-b border-slate-200 dark:border-slate-700">
              {(['all', '2gis', 'yandex_maps'] as SourceTab[]).map((st) => {
                const sp = sourcesProfiles.find((s) => s.source === st);
                const count = sp?.reviews_count ?? 0;
                const label =
                  st === 'all' ? 'Все' : st === '2gis' ? '2GIS' : 'Я.Карты';
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSourceTab(st)}
                    className={cn(
                      'border-b-2 px-2 py-1 text-xs font-medium transition-colors',
                      sourceTab === st
                        ? 'border-brand-500 text-brand-700 dark:border-brand-400 dark:text-brand-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                    )}
                  >
                    {label}
                    {st !== 'all' && count > 0 ? ` (${count})` : ''}
                  </button>
                );
              })}
            </div>
          )}

          {/* === Tabs sentiment ===
              Счётчики динамически зависят от sourceTab: когда выбран 2GIS или
              Я.Карты — берём reviews_* из соответствующего CompanySourceOut, а
              не из общих detail.reviews_* (иначе при переключении источника
              счётчики «застревают» на общих и юзер думает что фильтр сломан). */}
          {(() => {
            const activeProfile =
              sourceTab === 'all'
                ? null
                : sourcesProfiles.find((s) => s.source === sourceTab) ?? null;
            const totalAll = activeProfile?.reviews_count ?? detail.reviews_count;
            const totalNeg =
              activeProfile?.reviews_negative_count ?? detail.reviews_negative_count;
            const totalPos =
              activeProfile?.reviews_positive_count ?? detail.reviews_positive_count;
            return (
          <div>
            <div className="mb-2 flex gap-2 border-b border-slate-200 dark:border-slate-700">
              {(['all', 'negative', 'positive'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'border-b-2 px-2 py-1 text-xs font-medium transition-colors',
                    tab === t
                      ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  {t === 'all'
                    ? `Все${totalAll > 0 ? ` (${totalAll})` : ''}`
                    : t === 'negative'
                      ? `Негатив${totalNeg > 0 ? ` (${totalNeg})` : ''}`
                      : `Позитив${totalPos > 0 ? ` (${totalPos})` : ''}`}
                </button>
              ))}
            </div>

            {/* === Drawer filter row: text search + has_owner_reply === */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  type="text"
                  placeholder="Поиск в тексте отзыва…"
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  className="h-8 text-[13px] pl-8 pr-7"
                />
                {textQuery && (
                  <button
                    type="button"
                    onClick={() => setTextQuery('')}
                    aria-label="Очистить поиск"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={onlyWithOwnerReply}
                  onChange={(e) => setOnlyWithOwnerReply(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                только с ответом владельца
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setTab('all');
                    setTextQuery('');
                    setOnlyWithOwnerReply(false);
                  }}
                  className="text-[12px] text-slate-500 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  сбросить
                </button>
              )}
            </div>

            {isLoading && reviews.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Загружаем отзывы…</div>
            ) : reviews.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {hasActiveFilters
                  ? 'Отзывов под текущие фильтры не найдено.'
                  : 'Отзывов нет.'}
              </div>
            ) : (
              <>
                {hasActiveFilters && !isLoading && (
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    показано {reviews.length}
                    {textQuery ? ` · по запросу «${debouncedText}»` : ''}
                  </div>
                )}
                <ul className="space-y-2">
                  {reviews.map((r) => (
                    <ReviewCard key={r.id} review={r} highlight={debouncedText} />
                  ))}
                </ul>
              </>
            )}
          </div>
            );
          })()}
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ContactsBlock — телефоны / email / соцсети / сайт.
//
// Источники:
//   - detail.phone — основной телефон от 2GIS
//   - detail.website — сайт от 2GIS
//   - detail.emails — список email от enrich_company_contacts (краулер сайта)
//   - detail.contacts_extra — { phones[], telegrams[], vks[], whatsapps[] }
//     тоже от краулера. fetched_url/error — служебные, не показываем.
//
// Дубли телефона из 2GIS и из contacts_extra.phones схлопываем.
// Если ни одного контакта нет — показываем подсказку, что обогащение
// контактов работает только когда у компании есть website.
// ---------------------------------------------------------------------------

interface ContactsExtra {
  phones?: string[];
  telegrams?: string[];
  vks?: string[];
  whatsapps?: string[];
  // прочие ключи (fetched_url, error) — игнорим
}

function normalizePhone(p: string): string {
  // Для дедупа: оставляем только цифры. +7 (495) 123-45-67 → 74951234567
  return p.replace(/\D+/g, '');
}

function LegalBlock({ legal }: { legal: CompanyDetailOut['legal'] }) {
  // Блок 2 ТЗ 2026-06-02 — юр.данные из DaData. Показываем только если
  // матч нашёлся (legal != null). На free-тарифе DaData revenue и
  // employee_count всегда null — для них фолбэк «нет данных».
  if (!legal) return null;

  const items: { label: string; value: React.ReactNode; mono?: boolean }[] = [];
  if (legal.inn) items.push({ label: 'ИНН', value: legal.inn, mono: true });
  if (legal.ogrn) items.push({ label: 'ОГРН', value: legal.ogrn, mono: true });
  if (legal.legal_short_name || legal.legal_name) {
    items.push({
      label: 'Юр.лицо',
      value: legal.legal_short_name || legal.legal_name || '—',
    });
  }
  if (typeof legal.age_years === 'number') {
    items.push({ label: 'Возраст', value: `${legal.age_years} лет` });
  }
  if (legal.registration_date) {
    items.push({ label: 'Зарегистрирована', value: legal.registration_date });
  }
  if (typeof legal.revenue === 'number' && legal.revenue > 0) {
    items.push({
      label: 'Оборот',
      value: `${(legal.revenue / 1_000_000).toFixed(1)} млн ₽`,
    });
  }
  if (typeof legal.employee_count === 'number' && legal.employee_count > 0) {
    items.push({ label: 'Сотрудников', value: legal.employee_count });
  }
  if (legal.legal_status) {
    items.push({
      label: 'Статус',
      value:
        legal.legal_status === 'active'
          ? 'действующая'
          : legal.legal_status,
    });
  }
  if (legal.okved_name) {
    items.push({
      label: 'ОКВЭД',
      value: `${legal.okved ?? ''} ${legal.okved_name}`.trim(),
    });
  }
  // ЛПР (ТЗ A.1 2026-06-04): ФИО + должность руководителя из DaData.
  // Юзер видит «ЛПР: Иванов Иван Иванович, Генеральный директор» и
  // может писать письмо на конкретное имя, а не в info@.
  if (legal.director_name) {
    const post = legal.director_post ? `, ${legal.director_post}` : '';
    items.push({
      label: 'ЛПР',
      value: `${legal.director_name}${post}`,
    });
  }

  if (items.length === 0) return null;

  // Человечий вид способа матча: показываем рядом с %, чтобы юзеру было
  // понятно «почему именно эти юр.данные» без раскрытия tooltip.
  const matchedByRu: Record<string, string> = {
    phone: 'по телефону',
    name_address: 'по названию и адресу',
    name_city: 'по названию и городу',
    inn: 'по ИНН',
    manual: 'вручную',
  };
  const matchedByLabel = legal.matched_by ? matchedByRu[legal.matched_by] ?? legal.matched_by : null;
  return (
    <div className="rounded-v2-sm border border-[color:var(--signal-cool)]/30 bg-[var(--signal-cool-bg)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--signal-cool)]">
          Юр.данные (DaData)
        </div>
        {typeof legal.match_confidence === 'number' && (
          <div
            className="text-[10px] text-blue-600 dark:text-blue-400"
            title={
              `Уверенность матча DaData ↔ компания: ${(legal.match_confidence * 100).toFixed(0)}%. ` +
              `Чем выше — тем надёжнее что это именно та компания. ` +
              `Способ: ${matchedByLabel ?? '—'}. ` +
              `100% — точный матч (например, по ИНН/телефону), ` +
              `<70% — стоит вручную проверить что юр.лицо реально совпадает.`
            }
          >
            совпадение {(legal.match_confidence * 100).toFixed(0)}%
            {matchedByLabel ? ` · ${matchedByLabel}` : ''}
          </div>
        )}
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[12px]">
        {items.map((it) => (
          <React.Fragment key={it.label}>
            <dt className="text-slate-500 dark:text-slate-400">{it.label}:</dt>
            <dd
              className={cn(
                'min-w-0 break-words text-slate-800 dark:text-slate-200',
                it.mono && 'font-mono'
              )}
            >
              {it.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}


function ContactsBlock({ detail }: { detail: CompanyDetailOut }) {
  const extra: ContactsExtra = (detail.contacts_extra ?? {}) as ContactsExtra;
  const emails: string[] = Array.isArray(detail.emails) ? detail.emails : [];

  // Телефоны: основной + extra.phones, без дублей по нормализованной форме.
  const phoneSet = new Map<string, string>();
  if (detail.phone) phoneSet.set(normalizePhone(detail.phone), detail.phone);
  for (const p of extra.phones ?? []) {
    const key = normalizePhone(p);
    if (key && !phoneSet.has(key)) phoneSet.set(key, p);
  }
  const phones = Array.from(phoneSet.values());

  const telegrams = (extra.telegrams ?? []).filter(Boolean);
  const vks = (extra.vks ?? []).filter(Boolean);
  const whatsapps = (extra.whatsapps ?? []).filter(Boolean);

  const hasAny =
    phones.length > 0 ||
    emails.length > 0 ||
    telegrams.length > 0 ||
    vks.length > 0 ||
    whatsapps.length > 0 ||
    !!detail.website;

  // Deeplink в карточку источника — фолбэк когда контактов нет совсем.
  // 2GIS: https://2gis.ru/firm/{external_id} — открывает реальную карточку
  // с телефонами/мессенджерами (которые их Catalog API не отдал на нашем плане).
  const sourceUrl = buildSourceUrl(detail.source, detail.external_id);

  if (!hasAny) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-[12px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
          Контактов от провайдера нет. 2GIS на нашем плане Catalog API не всегда
          отдаёт телефоны и не отдаёт мессенджеры — открой исходную карточку,
          там обычно всё есть.
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Открыть в {sourceLabel(detail.source)}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Контакты
      </div>
      <div className="flex flex-col gap-1.5 text-[13px]">
        {phones.map((p) => (
          <ContactRow key={`tel-${p}`} icon={<Phone className="h-3.5 w-3.5" />} href={`tel:${normalizePhone(p)}`}>
            {p}
          </ContactRow>
        ))}
        {emails.map((e) => (
          <ContactRow key={`mail-${e}`} icon={<Mail className="h-3.5 w-3.5" />} href={`mailto:${e}`}>
            {e}
          </ContactRow>
        ))}
        {detail.website && (
          <ContactRow
            icon={<Globe className="h-3.5 w-3.5" />}
            href={detail.website}
            external
          >
            {prettifyUrl(detail.website)}
          </ContactRow>
        )}
        {telegrams.map((t) => {
          const handle = t.startsWith('@') ? t.slice(1) : t;
          return (
            <ContactRow
              key={`tg-${t}`}
              icon={<Send className="h-3.5 w-3.5" />}
              href={`https://t.me/${handle}`}
              external
              label="Telegram"
            >
              @{handle}
            </ContactRow>
          );
        })}
        {vks.map((v) => (
          <ContactRow
            key={`vk-${v}`}
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            href={v.startsWith('http') ? v : `https://vk.com/${v.replace(/^@/, '')}`}
            external
            label="ВКонтакте"
          >
            {prettifyUrl(v)}
          </ContactRow>
        ))}
        {whatsapps.map((w) => {
          // w может быть номером или wa.me ссылкой
          const digits = normalizePhone(w);
          const href = w.startsWith('http') ? w : `https://wa.me/${digits}`;
          return (
            <ContactRow
              key={`wa-${w}`}
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              href={href}
              external
              label="WhatsApp"
            >
              {digits ? `+${digits}` : w}
            </ContactRow>
          );
        })}
        {sourceUrl && (
          <ContactRow
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            href={sourceUrl}
            external
            label={sourceLabel(detail.source)}
          >
            открыть исходную карточку
          </ContactRow>
        )}
      </div>
    </div>
  );
}

function buildSourceUrl(source: string, externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  if (source === '2gis') return `https://2gis.ru/firm/${externalId}`;
  if (source === 'yandex_maps') return `https://yandex.ru/maps/org/${externalId}`;
  return null;
}

function sourceLabel(source: string): string {
  if (source === '2gis') return '2GIS';
  if (source === 'yandex_maps') return 'Я.Картах';
  return source;
}

function sourceShortLabel(source: string): string {
  if (source === '2gis') return '2GIS';
  if (source === 'yandex_maps') return 'Я.Карты';
  return source;
}

// ---------------------------------------------------------------------------
// SourceMetricsBlock — мини-таблица «рейтинг × отзывы» по каждому источнику
// (Phase 5 multi-source). Расхождение rating/reviews между 2GIS и Я.Картами —
// полезный сигнал юзеру, может означать вылетевшие отзывы в одном из них или
// разную аудиторию.
// ---------------------------------------------------------------------------

function SourceMetricsBlock({ profiles }: { profiles: CompanyDetailOut['sources_profiles'] }) {
  const arr = profiles ?? [];
  if (arr.length < 2) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Метрики по источникам
      </div>
      <div className="grid grid-cols-[auto,1fr,1fr,1fr] gap-x-3 gap-y-1 text-[12px]">
        <div className="text-slate-500 dark:text-slate-400">Источник</div>
        <div className="text-slate-500 dark:text-slate-400">Рейтинг</div>
        <div className="text-slate-500 dark:text-slate-400">Отзывы</div>
        <div className="text-slate-500 dark:text-slate-400">Негатив</div>
        {arr.map((p) => (
          <React.Fragment key={p.source}>
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {sourceShortLabel(p.source)}
            </div>
            <div className="text-slate-700 dark:text-slate-200">
              {typeof p.rating === 'number' ? p.rating.toFixed(1) : '—'}
            </div>
            <div className="text-slate-700 dark:text-slate-200">{p.reviews_count}</div>
            <div className="text-slate-700 dark:text-slate-200">
              {p.reviews_negative_count > 0 ? p.reviews_negative_count : '—'}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultiSourceContactsBlock — контакты в РАЗДЕЛЁННЫХ секциях по источникам.
// Активен когда у компании ≥2 источниковых профиля (Phase 5 multi-source).
// Контакты внутри секции отсортированы: основной телефон/сайт первыми (is_primary),
// потом дополнительные. Между секциями ничего не дедуплицируется — это ТЗ §1.3.
// ---------------------------------------------------------------------------

type ContactProfile = NonNullable<CompanyDetailOut['sources_profiles']>[number];

function MultiSourceContactsBlock({ profiles }: { profiles: CompanyDetailOut['sources_profiles'] }) {
  const arr = profiles ?? [];
  if (arr.length === 0) return null;
  return (
    <div className="space-y-2">
      {arr.map((p) => (
        <SourceContactsSection key={`${p.source}-${p.external_id}`} profile={p} />
      ))}
    </div>
  );
}

function SourceContactsSection({ profile }: { profile: ContactProfile }) {
  const cs = profile.contacts ?? [];
  if (cs.length === 0 && !profile.source_url) return null;
  // Сортируем: primary первые, потом по типу phone→website→email→социалки.
  const order: Record<string, number> = {
    phone: 1, website: 2, email: 3, telegram: 4, whatsapp: 5,
    vk: 6, instagram: 7, facebook: 8, ok: 9, youtube: 10,
  };
  const sorted = [...cs].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (order[a.type] ?? 99) - (order[b.type] ?? 99);
  });
  const deepLink = buildSourceUrl(profile.source, profile.external_id);
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          По данным {sourceShortLabel(profile.source)}
        </div>
        {deepLink && (
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            <ExternalLink className="h-3 w-3" />
            Открыть в {sourceShortLabel(profile.source)}
          </a>
        )}
      </div>
      {sorted.length > 0 ? (
        <div className="flex flex-col gap-1.5 text-[13px]">
          {sorted.map((c, idx) => (
            <ContactValueRow key={`${c.type}-${c.value}-${idx}`} contact={c} />
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-slate-500 dark:text-slate-400">
          {profile.source === '2gis'
            ? 'Catalog API 2GIS не отдал контакты — открой исходную карточку.'
            : 'Контактов с карточки Я.Карт не получено.'}
        </div>
      )}
    </div>
  );
}

function ContactValueRow({ contact }: { contact: ContactProfile['contacts'][number] }) {
  const { type, value } = contact;
  // phone
  if (type === 'phone') {
    return (
      <ContactRow icon={<Phone className="h-3.5 w-3.5" />} href={`tel:${normalizePhone(value)}`}>
        {value}
      </ContactRow>
    );
  }
  if (type === 'email') {
    return (
      <ContactRow icon={<Mail className="h-3.5 w-3.5" />} href={`mailto:${value}`}>
        {value}
      </ContactRow>
    );
  }
  if (type === 'website') {
    return (
      <ContactRow icon={<Globe className="h-3.5 w-3.5" />} href={value} external>
        {prettifyUrl(value)}
      </ContactRow>
    );
  }
  if (type === 'telegram') {
    const handle = value.startsWith('http')
      ? value.replace(/^https?:\/\/(?:t\.me|telegram\.me)\//i, '').replace(/\/$/, '')
      : value.startsWith('@')
        ? value.slice(1)
        : value;
    return (
      <ContactRow
        icon={<Send className="h-3.5 w-3.5" />}
        href={value.startsWith('http') ? value : `https://t.me/${handle}`}
        external
        label="Telegram"
      >
        @{handle}
      </ContactRow>
    );
  }
  if (type === 'whatsapp') {
    const href = value.startsWith('http')
      ? value
      : `https://wa.me/${value.replace(/\D/g, '')}`;
    return (
      <ContactRow
        icon={<MessageCircle className="h-3.5 w-3.5" />}
        href={href}
        external
        label="WhatsApp"
      >
        {value}
      </ContactRow>
    );
  }
  if (type === 'vk' || type === 'instagram' || type === 'facebook' || type === 'ok' || type === 'youtube') {
    const href = value.startsWith('http') ? value : `https://${value}`;
    return (
      <ContactRow icon={<MessageCircle className="h-3.5 w-3.5" />} href={href} external label={type}>
        {prettifyUrl(value)}
      </ContactRow>
    );
  }
  return null;
}

function ContactRow({
  icon,
  href,
  external,
  label,
  children,
}: {
  icon: React.ReactNode;
  href: string;
  external?: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400 dark:text-slate-500" aria-hidden>
        {icon}
      </span>
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className="text-slate-700 underline hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
      >
        {children}
      </a>
      {label && (
        <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </span>
      )}
    </div>
  );
}

function prettifyUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function Metric({
  label,
  value,
  red,
  green,
}: {
  label: string;
  value: string;
  red?: boolean;
  green?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 px-2 py-1 dark:border-slate-700">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
      <div
        className={cn(
          'text-sm font-medium',
          red ? 'text-red-700 dark:text-red-400' : green ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewCard
// ---------------------------------------------------------------------------

function ReviewCard({ review, highlight }: { review: ReviewOut; highlight: string }) {
  const sentiment = review.sentiment as 'positive' | 'negative' | 'neutral' | null;
  const accent =
    sentiment === 'negative'
      ? 'border-l-[color:var(--signal-hot)] bg-[var(--signal-hot-bg)]'
      : sentiment === 'positive'
        ? 'border-l-[color:var(--signal-good)] bg-[var(--signal-good-bg)]'
        : 'border-l-slate-300 bg-white dark:border-l-slate-600 dark:bg-slate-900';

  return (
    <li className={cn('rounded-md border border-slate-200 border-l-4 p-3 dark:border-slate-700', accent)}>
      <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500 flex-wrap dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {review.author_masked || 'Аноним'}
        </span>
        {review.rating != null && <StarRating value={review.rating} />}
        {review.posted_at && (
          <span>{new Date(review.posted_at).toLocaleDateString('ru-RU')}</span>
        )}
        {sentiment && <SentimentBadge sentiment={sentiment} />}
        {review.has_owner_reply && (
          <span className="rounded-v2-sm bg-[var(--signal-good-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--signal-good)]">
            ответ владельца
          </span>
        )}
      </div>
      {review.raw_text == null ? (
        <div className="text-sm text-slate-400 dark:text-slate-500">
          Текст удалён по политике хранения.{' '}
          {review.source_url && (
            <a
              className="underline"
              href={review.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть оригинал
            </a>
          )}
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
          {highlight ? <HighlightedText text={review.raw_text} needle={highlight} /> : review.raw_text}
        </div>
      )}
      {Array.isArray(review.pain_tags) && review.pain_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {review.pain_tags.map((t) => (
            <span
              key={t.id}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function StarRating({ value }: { value: number }) {
  // value 1..5; красим первые value звёзд жёлтым, остальные серым
  const stars = [1, 2, 3, 4, 5].map((i) => {
    const filled = i <= value;
    return (
      <Star
        key={i}
        className={cn(
          'h-3 w-3',
          filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
        )}
      />
    );
  });
  return <span className="inline-flex items-center gap-0.5">{stars}</span>;
}

function SentimentBadge({ sentiment }: { sentiment: 'positive' | 'negative' | 'neutral' }) {
  const cfg = {
    positive: { label: 'позитив', cls: 'bg-[var(--signal-good-bg)] text-[color:var(--signal-good)]' },
    negative: { label: 'негатив', cls: 'bg-[var(--signal-hot-bg)] text-[color:var(--signal-hot)]' },
    neutral: { label: 'нейтр.', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  }[sentiment];
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  );
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

function HighlightedText({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  // Регистронезависимое разбиение по needle. Не делаем regex-escape — пользователь
  // вводит обычные слова, спецсимволы (скобки и т.п.) сломают сплит, поэтому
  // экранируем minimally.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} className="rounded bg-[var(--signal-warm)]/40 px-0.5 text-slate-900 dark:text-amber-100">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}


// ЛПР со страниц сайта (ТЗ A.2 2026-06-04). decision_makers[] — массив,
// отсортированный API по убыванию is_decision_maker + confidence. Если пуст
// — компонент не рендерится (нет смысла показывать пустой блок).
function DecisionMakersBlock({
  decisionMakers,
}: {
  decisionMakers: DecisionMakerOut[];
}) {
  if (!decisionMakers || decisionMakers.length === 0) return null;
  // Делим: верхние is_dm и остальные. Если все без is_dm — показываем общим
  // списком «контактные лица» без выделения.
  const dms = decisionMakers.filter((d) => d.is_decision_maker);
  const others = decisionMakers.filter((d) => !d.is_decision_maker);
  const sourceLabel: Record<string, string> = {
    website_team: 'команда сайта',
    website_about: 'страница «о нас»',
    website_contacts: 'контакты сайта',
  };
  return (
    <div className="rounded-v2-sm border border-[color:var(--signal-good)]/30 bg-[var(--signal-good-bg)] p-3">
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[color:var(--signal-good)]">
        ЛПР с сайта компании
      </div>
      <ul className="space-y-1.5">
        {(dms.length > 0 ? dms : others).map((d, i) => (
          <li key={`${d.name}-${i}`} className="text-[12px]">
            <span className="font-medium text-slate-800 dark:text-slate-100">{d.name}</span>
            {d.post && (
              <span className="text-slate-600 dark:text-slate-300">{` · ${d.post}`}</span>
            )}
            {d.source_url && (
              <a
                href={d.source_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-1 text-[10px] uppercase tracking-wider text-slate-500 hover:text-brand-600 dark:text-slate-400"
                title={sourceLabel[d.source] ?? d.source}
              >
                ↗
              </a>
            )}
          </li>
        ))}
      </ul>
      {dms.length > 0 && others.length > 0 && (
        <details className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer">
            + {others.length} сотрудник{others.length > 1 ? 'ов' : 'а'} (не ЛПР)
          </summary>
          <ul className="mt-1 space-y-1 pl-3">
            {others.map((d, i) => (
              <li key={`other-${d.name}-${i}`}>
                <span className="font-medium">{d.name}</span>
                {d.post && <span>{` · ${d.post}`}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Блок диапазона дат + помесячный bar-chart для выбранной боли.
 * Юзер 2026-06-10:
 *   - 3-A: «12.03–28.05» рядом с тегом (first_review_at..last_review_at)
 *   - 3-C: полный chart с разбивкой по источнику (2GIS / Я.Карты), фильтр
 *     синхронизирован с sourceTab drawer-а.
 *
 * Chart реализован чистым SVG (без recharts) — экономим ~150KB бандла,
 * упрощаем темизацию. Группировка bars по source: 2GIS — sky, Я.Карты —
 * rose, остальные — slate.
 */
function PainTrendBlock({
  trend,
  label,
  hasSourceTabs,
  sourceTab,
}: {
  trend: PainTrendOut;
  label: string;
  hasSourceTabs: boolean;
  sourceTab: SourceTab;
}) {
  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Сгруппируем по месяцам, внутри — по источнику. Получаем матрицу
  // { '2026-03': { '2gis': 3, 'yandex_maps': 5 }, ... }
  const byMonth = new Map<string, Record<string, number>>();
  for (const p of trend.points) {
    const row = byMonth.get(p.month) ?? {};
    row[p.source] = (row[p.source] ?? 0) + p.count;
    byMonth.set(p.month, row);
  }
  const months = Array.from(byMonth.keys()).sort();
  const allSources = Array.from(
    new Set(trend.points.map((p) => p.source)),
  );
  const sourceColor: Record<string, string> = {
    '2gis': '#0ea5e9',         // sky-500
    'yandex_maps': '#f43f5e',  // rose-500
    'google': '#a855f7',       // purple-500
  };
  const sourceShortLabel: Record<string, string> = {
    '2gis': '2GIS',
    'yandex_maps': 'Я.Карты',
    'google': 'Google',
  };

  // Размеры chart
  const W = 460;
  const H = 140;
  const PAD = { top: 12, right: 8, bottom: 24, left: 24 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const groupWidth = months.length > 0 ? innerW / months.length : innerW;
  const barWidth = Math.max(
    2,
    Math.min(20, (groupWidth - 4) / Math.max(1, allSources.length)),
  );
  const maxCount = Math.max(
    1,
    ...trend.points.map((p) => p.count),
  );

  return (
    <div className="mt-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Динамика боли
        </span>
        <span className="rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          {fmt(trend.first_review_at)} — {fmt(trend.last_review_at)} · {trend.total_reviews} отз.
        </span>
      </div>

      {months.length === 0 ? (
        <div className="text-[11.5px] text-slate-500 dark:text-slate-400">
          Нет дат у отзывов этой боли (источник не отдаёт posted_at) — графика недоступна.
        </div>
      ) : (
        <>
          <svg
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block"
            role="img"
            aria-label={`Динамика жалоб «${label}» по месяцам`}
          >
            {/* baseline */}
            <line
              x1={PAD.left}
              y1={PAD.top + innerH}
              x2={PAD.left + innerW}
              y2={PAD.top + innerH}
              stroke="currentColor"
              className="text-slate-300 dark:text-slate-600"
              strokeWidth={1}
            />
            {/* Y axis ticks (0 / max) */}
            <text
              x={PAD.left - 4}
              y={PAD.top + 4}
              textAnchor="end"
              fontSize={9}
              className="fill-slate-500 dark:fill-slate-400 tabular-nums"
            >
              {maxCount}
            </text>
            <text
              x={PAD.left - 4}
              y={PAD.top + innerH}
              textAnchor="end"
              fontSize={9}
              className="fill-slate-500 dark:fill-slate-400 tabular-nums"
            >
              0
            </text>
            {months.map((m, mi) => {
              const groupX = PAD.left + mi * groupWidth + 2;
              const monthRow = byMonth.get(m) ?? {};
              return (
                <g key={m}>
                  {allSources.map((src, si) => {
                    const count = monthRow[src] ?? 0;
                    const h = (count / maxCount) * innerH;
                    const x = groupX + si * barWidth;
                    const y = PAD.top + innerH - h;
                    return (
                      <rect
                        key={src}
                        x={x}
                        y={y}
                        width={Math.max(1, barWidth - 1)}
                        height={Math.max(0, h)}
                        fill={sourceColor[src] ?? '#94a3b8'}
                        opacity={0.9}
                      >
                        <title>
                          {m} · {sourceShortLabel[src] ?? src} · {count}
                        </title>
                      </rect>
                    );
                  })}
                  {(mi === 0 || mi === months.length - 1 || mi % Math.ceil(months.length / 6) === 0) && (
                    <text
                      x={groupX + (allSources.length * barWidth) / 2}
                      y={PAD.top + innerH + 12}
                      textAnchor="middle"
                      fontSize={9}
                      className="fill-slate-500 dark:fill-slate-400 tabular-nums"
                    >
                      {m.slice(2)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-600 dark:text-slate-300">
            {allSources.map((src) => (
              <span key={src} className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: sourceColor[src] ?? '#94a3b8' }}
                />
                {sourceShortLabel[src] ?? src}
              </span>
            ))}
            {hasSourceTabs && (
              <span className="ml-auto italic text-slate-500 dark:text-slate-400">
                {sourceTab === 'all'
                  ? 'Все источники'
                  : `Фильтр: ${sourceShortLabel[sourceTab] ?? sourceTab}`}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
