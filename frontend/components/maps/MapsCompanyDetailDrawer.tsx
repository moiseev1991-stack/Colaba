'use client';

/**
 * Карточка компании — панель справа (вид Premium, 17.09).
 *
 * Шапка не прокручивается: название, ниша и адрес, рейтинг и сигналы, действия
 * «Написать» (КП под боль) и «В список», вкладки:
 *  - Обзор — показатели, главная жалоба, кто принимает решение, данные по источникам, юр. данные;
 *  - Жалобы — сводка за период; клик по боли → динамика и отзывы темы; сравнение с нишей; все темы;
 *  - Отзывы — источник, тональность, поиск по тексту, «только с ответом владельца»;
 *  - Контакты — телефоны, почта, мессенджеры, ЛПР и запуск поиска ЛПР.
 *
 * Весь прежний функционал сохранён — блоки только разнесены по вкладкам.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isUnnamedPainLabel } from '@/lib/painLabels';
import {
  Check,
  Circle,
  ExternalLink,
  Globe,
  ListPlus,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  RotateCw,
  Search as SearchIcon,
  Send,
  Star,
  Target,
  User,
  X,
} from 'lucide-react';

import { AddToListModal } from '@/components/maps/AddToListModal';
import { CompanyDigestBlock } from '@/components/maps/CompanyDigestBlock';
import { DrawerSection } from '@/components/maps/DrawerSection';
import { KpModal } from '@/components/maps/KpModal';
import { MonthlySourceBars } from '@/components/maps/MonthlySourceBars';
import { NegativeTrendBadge } from '@/components/maps/NegativeTrendBadge';
import { PainBenchmarkBlock } from '@/components/maps/PainBenchmarkBlock';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { DialogCloseButton, Drawer } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/tabs';
import { cn, pluralRu } from '@/lib/utils';
import {
  enrichCompaniesMarketingDm,
  enrichCompanySource,
  getCompanyDetail,
  getCompanyPainTrend,
  getCompanyReviews,
  getNichePainTrend,
  type CompanyDetailOut,
  type DecisionMakerOut,
  type EnrichSource,
  type PainTrendOut,
  type ReviewOut,
} from '@/src/services/api/maps';

type Tab = 'all' | 'negative' | 'positive';
type SourceTab = 'all' | '2gis' | 'yandex_maps';
type DrawerView = 'overview' | 'pains' | 'reviews' | 'contacts';

interface Props {
  companyId: number | null;
  /** ТЗ Marketing-DM 2026-06-20 §4.1: нужен для кнопки «Найти ЛПР» —
   *  POST /maps/companies/enrich-marketing-dm требует search_id для
   *  проверки владения. Если null — кнопки, связанные с search_id
   *  (Найти ЛПР, source-retry) не показываются. Полезно для /app/pains,
   *  где drawer открывается без контекста конкретного поиска. */
  searchId: number | null;
  onClose: () => void;
}

export function MapsCompanyDetailDrawer({ companyId, searchId, onClose }: Props) {
  const [detail, setDetail] = useState<CompanyDetailOut | null>(null);
  const [view, setView] = useState<DrawerView>('overview');
  // Окна поверх карточки: КП («Написать») и добавление в список.
  const [kpOpen, setKpOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  // Phase 5 multi-source: вкладка по источнику. 'all' = без фильтра.
  const [sourceTab, setSourceTab] = useState<SourceTab>('all');
  const [reviews, setReviews] = useState<ReviewOut[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Юзер 2026-06-10: клик по боли → фильтр отзывов + график + диапазон дат.
  // Когда null — обычный режим.
  const [activePainTagId, setActivePainTagId] = useState<number | null>(null);
  const [activePainLabel, setActivePainLabel] = useState<string>('');
  const [painTrend, setPainTrend] = useState<PainTrendOut | null>(null);
  // §B 2026-06-10: график переключается между «эта компания» и «вся ниша».
  const [trendScope, setTrendScope] = useState<'company' | 'niche'>('company');
  // Корень содержимого: его родитель — прокручиваемая часть панели.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Динамика и отзывы выбранной боли во вкладке «Жалобы» — прокручиваем сюда после клика.
  const painAnchorRef = useRef<HTMLDivElement | null>(null);

  // drawer-level фильтры (применяются к /maps/companies/{id}/reviews)
  const [textQuery, setTextQuery] = useState('');
  const [onlyWithOwnerReply, setOnlyWithOwnerReply] = useState(false);

  // Юзер 2026-06-11: окно сводки отзывов. null = «за всё время».
  const [digestDays, setDigestDays] = useState<30 | 90 | 180 | 365 | null>(30);

  // debounce для текстового поиска (300мс)
  const [debouncedText, setDebouncedText] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(textQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [textQuery]);

  // ТЗ Marketing-DM §4.1: state для кнопки «Найти ЛПР» — простой pending
  // + result-flash. Оркестратор с countdown=45s внутри, кнопка сразу
  // возвращает queued=1 и уходит в disabled на 45 секунд.
  const [dmEnrichPending, setDmEnrichPending] = useState(false);
  const [dmEnrichResult, setDmEnrichResult] = useState<string | null>(null);
  // 2026-07-10: через 55s после клика перезагружаем компанию → decision_makers
  // подтянутся автоматически. Если после рефетча всё ещё пусто — показываем
  // явный «не нашли», а не молча возвращаем кнопку.
  const [dmSearchExhausted, setDmSearchExhausted] = useState(false);
  // 2026-07-11: точечный триггер source-парсера (клик по плашке «ВК»/«hh.ru»/…).
  // 2026-07-16: независимый per-source — disabled только та плашка, у которой запрос в полёте.
  const [triggeringSources, setTriggeringSources] = useState<Set<EnrichSource>>(() => new Set());
  const handleSourceRetry = useCallback(
    async (source: EnrichSource) => {
      if (companyId == null) return;
      // Уже крутится ЭТА плашка — тихо игнорируем повторный клик по ней.
      if (triggeringSources.has(source)) return;
      setTriggeringSources((prev) => {
        const next = new Set(prev);
        next.add(source);
        return next;
      });
      try {
        // searchId=null — валидный кейс для /app/pains (бэк проверит владение
        // через любой user-search'ев). Проксируем null.
        await enrichCompanySource(companyId, source, searchId);
        // eslint-disable-next-line no-console
        console.log('[drawer] source-retry OK', { source, companyId, searchId });
      } catch (e: any) {
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail || e?.message || 'unknown';
        // eslint-disable-next-line no-console
        console.error('[drawer] source-retry FAILED', { source, status, detail });
        setDmEnrichResult(
          `Не удалось запустить ${source}: ${status ? `HTTP ${status} — ` : ''}${detail}`,
        );
        setTriggeringSources((prev) => {
          const next = new Set(prev);
          next.delete(source);
          return next;
        });
        return;
      }
      // Через 55с рефетч карточки: нашёл источник что-то — плашка станет ✓·N.
      window.setTimeout(async () => {
        const clearTriggering = () =>
          setTriggeringSources((prev) => {
            const next = new Set(prev);
            next.delete(source);
            return next;
          });
        if (companyId == null) {
          clearTriggering();
          return;
        }
        try {
          const fresh = await getCompanyDetail(companyId);
          setDetail(fresh);
        } catch {
          // Тихо.
        } finally {
          clearTriggering();
        }
      }, 55_000);
    },
    [companyId, searchId, triggeringSources],
  );

  const handleFindDm = useCallback(async () => {
    if (companyId == null || dmEnrichPending) return;
    setDmEnrichPending(true);
    setDmEnrichResult(null);
    setDmSearchExhausted(false);
    try {
      const r = await enrichCompaniesMarketingDm(searchId, [companyId]);
      setDmEnrichResult(
        r.queued > 0
          ? `Поиск запущен — hh, VK, ЕГРЮЛ… результат ~1 минуту${r.vk_enabled ? '' : ' (VK не настроен)'}`
          : 'Не удалось запустить поиск',
      );
    } catch (e) {
      setDmEnrichResult('Ошибка — попробуйте ещё раз');
      setDmEnrichPending(false);
      return;
    }
    // Через 55 сек: рефетч карточки + если пусто → пометить как «искали, не нашли».
    window.setTimeout(async () => {
      if (companyId == null) return;
      try {
        const fresh = await getCompanyDetail(companyId);
        setDetail(fresh);
        const foundMarketing = (fresh.decision_makers || []).some(
          (d) => d.is_marketing_dm === true,
        );
        if (!foundMarketing) {
          setDmSearchExhausted(true);
          setDmEnrichResult(
            'Не нашли маркетинг-ЛПР ни в одном источнике: hh.ru (нет вакансии маркетолога), ' +
              'VK (нет контакта с маркетинг-ролью), сайт (нет раздела «команда/маркетинг»), ' +
              'ЕГРЮЛ (директор — не маркетинг). Все найденные контакты — в блоке «Другие контакты для касания» ниже.',
          );
        } else {
          setDmEnrichResult(null);
        }
      } catch {
        // Тихо — юзер сможет перезапустить.
      } finally {
        setDmEnrichPending(false);
      }
    }, 55_000);
  }, [companyId, searchId, dmEnrichPending]);

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
    setView('overview');
    setKpOpen(false);
    setListOpen(false);
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
    // Без сброса при переходе A → B шапка секунду показывала бы прошлую компанию.
    setDetail(null);
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
      tab === 'all' &&
      !debouncedText &&
      !onlyWithOwnerReply &&
      sourceTab === 'all' &&
      activePainTagId == null
    ) {
      setReviews(detail.recent_reviews);
      return;
    }
    void loadReviews();
  }, [
    tab,
    debouncedText,
    onlyWithOwnerReply,
    sourceTab,
    activePainTagId,
    companyId,
    detail,
    loadReviews,
  ]);

  // Данные графика по выбранной боли (диапазон дат + помесячно по источникам).
  // Перезапрашиваем при смене sourceTab/trendScope.
  useEffect(() => {
    if (companyId == null || activePainTagId == null) {
      setPainTrend(null);
      return;
    }
    let mounted = true;
    const sourceArg = sourceTab === 'all' ? undefined : sourceTab;
    const fetcher =
      trendScope === 'niche' && detail?.niche
        ? getNichePainTrend(detail.niche, activePainTagId, detail.city ?? null, sourceArg)
        : getCompanyPainTrend(companyId, activePainTagId, sourceArg);
    fetcher
      .then((d) => {
        if (mounted) setPainTrend(d as PainTrendOut);
      })
      .catch(() => {
        if (mounted) setPainTrend(null);
      });
    return () => {
      mounted = false;
    };
  }, [companyId, activePainTagId, sourceTab, trendScope, detail?.niche, detail?.city]);

  const changeView = useCallback((next: DrawerView) => {
    setView(next);
    // Новая вкладка открывается с начала, а не с места прокрутки прошлой.
    const scroller = bodyRef.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, []);

  const clearPain = useCallback(() => {
    setActivePainTagId(null);
    setActivePainLabel('');
    setPainTrend(null);
  }, []);

  // Выбор боли: фильтр отзывов по теме, график, прокрутка к ним во вкладке «Жалобы».
  const activatePain = useCallback((painTagId: number, label: string) => {
    setActivePainTagId(painTagId);
    setActivePainLabel(label);
    setTab('all');
    setTextQuery('');
    setOnlyWithOwnerReply(false);
    // Даём вкладке отрисоваться, а фильтру — начать загрузку.
    window.setTimeout(() => {
      painAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  const togglePain = useCallback(
    (painTagId: number, label: string) => {
      if (painTagId === -1 || activePainTagId === painTagId) clearPain();
      else activatePain(painTagId, label);
    },
    [activePainTagId, activatePain, clearPain],
  );

  const handleClose = useCallback(() => {
    // Escape при открытом окне КП или списка закрывает только это окно, а не всю карточку.
    if (kpOpen) setKpOpen(false);
    else if (listOpen) setListOpen(false);
    else onClose();
  }, [kpOpen, listOpen, onClose]);

  const open = companyId != null;
  const sourcesProfiles = detail?.sources_profiles ?? [];
  // Метрики и контакты разносим по источникам, только если источников 2+.
  const showMultiSourceMeta = sourcesProfiles.length >= 2;
  const painTags = detail ? uniquePainTags(detail.pain_tags) : [];

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      className="max-w-[640px]"
      header={(titleId) => (
        <CompanyDrawerHeader
          titleId={titleId}
          detail={detail}
          view={view}
          onViewChange={changeView}
          onClose={handleClose}
          onWrite={() => setKpOpen(true)}
          onAddToList={() => setListOpen(true)}
          painCount={painTags.length}
          contactCount={detail ? countContacts(detail) : 0}
        />
      )}
    >
      <div ref={bodyRef}>
        {!detail ? (
          <div className="space-y-3" aria-busy="true">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" rounded="md" />
              ))}
            </div>
            <Skeleton className="h-28" rounded="md" />
            <Skeleton className="h-40" rounded="md" />
            <span className="sr-only">Загрузка карточки…</span>
          </div>
        ) : view === 'overview' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Stat label="Рейтинг" value={detail.rating?.toFixed(1) ?? '—'} />
              <Stat label="Отзывов" value={detail.reviews_count} />
              <Stat label="Негатив" value={detail.reviews_negative_count} tone="danger" />
              <Stat label="Позитив" value={detail.reviews_positive_count} tone="success" />
              <Stat
                label="Ответы владельца"
                value={detail.has_owner_replies ? detail.owner_replies_count : 'нет'}
              />
            </div>

            <MainPainSection
              detail={detail}
              onOpenPain={(id, label) => {
                changeView('pains');
                activatePain(id, label);
              }}
              onOpenPains={() => changeView('pains')}
            />

            <DecisionMakerSummary detail={detail} onOpenContacts={() => changeView('contacts')} />

            {showMultiSourceMeta && <SourceMetricsBlock profiles={sourcesProfiles} />}

            {/* Юр. данные из DaData (блок 2 ТЗ). Рендерим всегда: если матч не найден — пишем об этом. */}
            <LegalBlock legal={detail.legal} />
          </div>
        ) : view === 'pains' ? (
          <div className="space-y-4">
            {/* Сводка за период + главные боли. Клик по боли → ниже динамика и отзывы темы. */}
            <CompanyDigestBlock
              companyId={detail.id}
              days={digestDays}
              onDaysChange={setDigestDays}
              activePainTagId={activePainTagId}
              onPainClick={togglePain}
            />

            {activePainTagId != null && (
              <div ref={painAnchorRef} className="scroll-mt-2 space-y-4">
                {painTrend && (
                  <PainTrendBlock
                    trend={painTrend}
                    label={activePainLabel}
                    hasSourceTabs={showMultiSourceMeta}
                    sourceTab={sourceTab}
                    scope={trendScope}
                    onScopeChange={setTrendScope}
                    niche={detail.niche ?? null}
                    city={detail.city ?? null}
                  />
                )}
                <DrawerSection
                  title={`Отзывы по теме «${activePainLabel}»`}
                  aside={
                    <button
                      type="button"
                      onClick={clearPain}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-ui-text-muted hover:text-ui-text"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Снять тему
                    </button>
                  }
                >
                  <ReviewsList
                    reviews={reviews}
                    isLoading={isLoading}
                    highlight=""
                    emptyText="Отзывов по этой теме не нашлось."
                  />
                  {reviews.length > 0 && (
                    <button
                      type="button"
                      onClick={() => changeView('reviews')}
                      className="mt-3 text-small font-semibold text-ui-accent hover:underline"
                    >
                      Искать в отзывах темы →
                    </button>
                  )}
                </DrawerSection>
              </div>
            )}

            {/* §1 ТЗ 2026-06-10: профиль болей компании против средних по нише и городу. */}
            <PainBenchmarkBlock companyId={detail.id} />

            {/* Полный список тем — справочно, не кликается (кликабельные боли — в сводке выше). */}
            {painTags.length > 0 && (
              <DrawerSection title="Все темы жалоб">
                <div className="flex flex-wrap gap-1.5">
                  {painTags.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-full bg-ui-surface-2 px-3 py-1 text-xs font-medium text-ui-text-muted"
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
              </DrawerSection>
            )}
          </div>
        ) : view === 'reviews' ? (
          <ReviewsView
            detail={detail}
            reviews={reviews}
            isLoading={isLoading}
            tab={tab}
            onTabChange={setTab}
            sourceTab={sourceTab}
            onSourceTabChange={setSourceTab}
            textQuery={textQuery}
            debouncedText={debouncedText}
            onTextQueryChange={setTextQuery}
            onlyWithOwnerReply={onlyWithOwnerReply}
            onOnlyWithOwnerReplyChange={setOnlyWithOwnerReply}
            painLabel={activePainTagId != null ? activePainLabel : null}
            onClearPain={clearPain}
          />
        ) : (
          <div className="space-y-4">
            {showMultiSourceMeta ? (
              <>
                <MultiSourceContactsBlock profiles={sourcesProfiles} />
                {/* Почта и мессенджеры, найденные на сайте компании, — отдельно от карточек карт. */}
                <ContactsBlock detail={detail} crawledOnly />
              </>
            ) : (
              <ContactsBlock detail={detail} />
            )}

            {/* ЛПР со страниц сайта / ВК / hh / ЕГРЮЛ (ТЗ A.2 + Marketing-DM). Рендерится всегда:
                в пустом состоянии — кнопка «Найти ЛПР»; после пустого поиска — «не нашли». */}
            <DecisionMakersBlock
              decisionMakers={detail.decision_makers ?? []}
              onFindDm={handleFindDm}
              dmEnrichPending={dmEnrichPending}
              dmEnrichResult={dmEnrichResult}
              searchExhausted={dmSearchExhausted}
              legalMatchConfidence={detail.legal?.match_confidence ?? null}
              hiringMarketing={detail.hiring_marketing ?? false}
              legalDirectorName={detail.legal?.director_name ?? null}
              legalDirectorPost={detail.legal?.director_post ?? null}
              genericEmails={detail.generic_emails ?? []}
              onSourceRetry={handleSourceRetry}
              triggeringSources={triggeringSources}
            />
          </div>
        )}

        {detail && (
          <>
            {/* КП: модалка сама грузит шаблоны и генерирует письмо по клику. */}
            <KpModal
              open={kpOpen}
              companyId={detail.id}
              companyName={detail.name}
              onClose={() => setKpOpen(false)}
            />
            <AddToListModal
              open={listOpen}
              companyIds={[detail.id]}
              defaultListName={
                detail.niche && detail.city ? `${detail.niche} — ${detail.city}` : undefined
              }
              onClose={() => setListOpen(false)}
              onDone={() => setListOpen(false)}
            />
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ===== Шапка ===== */

function CompanyDrawerHeader({
  titleId,
  detail,
  view,
  onViewChange,
  onClose,
  onWrite,
  onAddToList,
  painCount,
  contactCount,
}: {
  titleId: string;
  detail: CompanyDetailOut | null;
  view: DrawerView;
  onViewChange: (view: DrawerView) => void;
  onClose: () => void;
  onWrite: () => void;
  onAddToList: () => void;
  painCount: number;
  contactCount: number;
}) {
  const address = detail ? formatAddressWithCity(detail.address, detail.city) : null;
  const meta = [detail?.niche, address].filter(Boolean).join(' · ');
  const rating = detail?.rating ?? null;
  const negatives = detail?.reviews_negative_count ?? 0;
  const hasPains = (detail?.top_pains ?? []).length > 0;

  return (
    <div className="border-b border-ui-border px-6 pt-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="text-xl font-bold leading-snug tracking-tight text-ui-text [overflow-wrap:anywhere]"
          >
            {detail?.name ?? 'Загрузка…'}
          </h2>
          {meta && <p className="mt-1 text-small text-ui-text-muted">{meta}</p>}
        </div>
        <DialogCloseButton onClose={onClose} />
      </div>

      {detail ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-small">
            {rating != null && (
              <span
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-0.5 font-semibold tabular-nums',
                  rating < 4
                    ? 'bg-ui-danger/10 text-ui-danger'
                    : rating < 4.3
                      ? 'bg-ui-warning/10 text-ui-warning'
                      : 'bg-ui-success/10 text-ui-success',
                )}
              >
                {rating.toFixed(1)} ★{' '}
                <span className="font-medium opacity-75">{detail.reviews_count} отз.</span>
              </span>
            )}
            {negatives > 0 && (
              <span className="font-semibold text-ui-danger">
                {negatives}{' '}
                {pluralRu(negatives, [
                  'негативный отзыв',
                  'негативных отзыва',
                  'негативных отзывов',
                ])}
              </span>
            )}
            {/* §3 ТЗ 2026-06-10: «негатив растёт» — сигнал «писать сейчас». */}
            <NegativeTrendBadge companyId={detail.id} />
            {sourceCardLinks(detail).map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-ui-text-muted hover:text-ui-accent"
                title={`Открыть карточку в ${s.label}`}
              >
                {s.label}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-9 px-4"
              onClick={onWrite}
              iconLeft={<Send className="h-4 w-4" />}
              title={
                hasPains
                  ? 'Холодное письмо под главную боль клиентов с цитатой из отзыва'
                  : 'Общее письмо по шаблону — боли клиентов ещё не разобраны'
              }
            >
              Написать
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 px-4"
              onClick={onAddToList}
              iconLeft={<ListPlus className="h-4 w-4" />}
            >
              В список
            </Button>
            {detail.website && (
              <a
                href={detail.website}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: 'ghost', size: 'sm', className: 'h-9 px-4' })}
              >
                <Globe className="h-4 w-4" aria-hidden />
                Сайт
              </a>
            )}
          </div>

          <Tabs<DrawerView>
            aria-label="Разделы карточки компании"
            // На телефоне вкладки плотнее и лента уходит под край панели — прокручивается, а не переносится.
            className="-mx-6 mt-4 flex-nowrap gap-0 overflow-x-auto border-b-0 px-4 [scrollbar-width:none] sm:mx-0 sm:gap-1 sm:px-0 [&>button]:shrink-0 [&>button]:px-2.5 sm:[&>button]:px-3"
            value={view}
            onChange={onViewChange}
            items={[
              { value: 'overview', label: 'Обзор' },
              { value: 'pains', label: <TabLabel text="Жалобы" count={painCount} /> },
              { value: 'reviews', label: <TabLabel text="Отзывы" count={detail.reviews_count} /> },
              { value: 'contacts', label: <TabLabel text="Контакты" count={contactCount} /> },
            ]}
          />
        </>
      ) : (
        <div className="space-y-3 pb-4 pt-3" aria-hidden>
          <Skeleton className="h-6 w-40 rounded-full" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}

function TabLabel({ text, count }: { text: string; count: number }) {
  return (
    <span className="whitespace-nowrap">
      {text}
      {count > 0 && (
        <>
          {' '}
          <span className="ml-0.5 tabular-nums text-ui-text-muted">{count}</span>
        </>
      )}
    </span>
  );
}

/** Ссылки на карточки компании в 2GIS и Яндекс.Картах — по одной на источник. */
function sourceCardLinks(detail: CompanyDetailOut): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const seen = new Set<string>();
  const push = (source: string, href: string | null | undefined) => {
    if (!href || seen.has(source)) return;
    seen.add(source);
    out.push({ label: sourceShortLabel(source), href });
  };
  for (const p of detail.sources_profiles ?? []) {
    push(p.source, p.source_url || buildSourceUrl(p.source, p.external_id));
  }
  push(detail.source, buildSourceUrl(detail.source, detail.external_id));
  return out;
}

/* ===== Обзор ===== */

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'danger' | 'success';
}) {
  return (
    <div className="flex flex-col justify-between gap-1 rounded-card bg-ui-surface-2 px-3 py-2.5">
      <div className="text-xs leading-tight text-ui-text-muted">{label}</div>
      <div
        className={cn(
          'text-base font-bold tabular-nums',
          tone === 'danger'
            ? 'text-ui-danger'
            : tone === 'success'
              ? 'text-ui-success'
              : 'text-ui-text',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MainPainSection({
  detail,
  onOpenPain,
  onOpenPains,
}: {
  detail: CompanyDetailOut;
  onOpenPain: (painTagId: number, label: string) => void;
  onOpenPains: () => void;
}) {
  const topPain = (detail.top_pains ?? []).find((p) => !isUnnamedPainLabel(p.label)) ?? null;
  if (!topPain) {
    if (detail.reviews_negative_count === 0) return null;
    return (
      <DrawerSection title="Жалобы" tone="muted">
        <p className="text-small text-ui-text-muted">
          Темы жалоб появятся после разбора отзывов. Пока можно прочитать негативные отзывы во
          вкладке «Отзывы».
        </p>
      </DrawerSection>
    );
  }
  return (
    <DrawerSection
      title="Главная жалоба клиентов"
      aside={
        <button
          type="button"
          onClick={onOpenPains}
          className="text-xs font-semibold text-ui-accent hover:underline"
        >
          Все жалобы →
        </button>
      }
    >
      <button
        type="button"
        onClick={() => onOpenPain(topPain.pain_tag_id, topPain.label)}
        className="group block w-full text-left"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-semibold text-ui-text">{topPain.label}</span>
          {topPain.mention_count > 0 && (
            <span className="text-small tabular-nums text-ui-text-muted">
              {topPain.mention_count}{' '}
              {pluralRu(topPain.mention_count, ['упоминание', 'упоминания', 'упоминаний'])}
            </span>
          )}
        </span>
        {topPain.top_quote && (
          <span className="mt-2 block border-l-2 border-ui-danger/40 pl-3 text-small italic leading-relaxed text-ui-text-muted">
            «{topPain.top_quote}»
          </span>
        )}
        <span className="mt-3 inline-block text-small font-semibold text-ui-accent group-hover:underline">
          Динамика и отзывы по теме →
        </span>
      </button>
    </DrawerSection>
  );
}

/** Коротко «кому писать» — подробности и поиск ЛПР во вкладке «Контакты». */
function DecisionMakerSummary({
  detail,
  onOpenContacts,
}: {
  detail: CompanyDetailOut;
  onOpenContacts: () => void;
}) {
  const dms = detail.decision_makers ?? [];
  const person = dms.find((d) => d.is_marketing_dm) ?? dms.find((d) => d.is_decision_maker) ?? null;
  const director = detail.legal?.director_name ?? null;
  const generic = (detail.generic_emails ?? []).filter(Boolean);

  return (
    <DrawerSection
      title="Кому писать"
      aside={
        <button
          type="button"
          onClick={onOpenContacts}
          className="text-xs font-semibold text-ui-accent hover:underline"
        >
          Все контакты →
        </button>
      }
    >
      {person ? (
        <div className="space-y-1">
          <div className="text-sm">
            <span className="font-semibold text-ui-text">{person.name}</span>
            {person.post && <span className="text-ui-text-muted">{` · ${person.post}`}</span>}
          </div>
          {person.contact_value ? (
            <DecisionMakerContact dm={person} />
          ) : (
            <p className="text-small text-ui-text-muted">
              Личного контакта нет{generic.length > 0 ? ` — общая почта ${generic[0]}` : ''}.
            </p>
          )}
        </div>
      ) : director ? (
        <div className="space-y-1">
          <div className="text-sm">
            <span className="font-semibold text-ui-text">{director}</span>
            {detail.legal?.director_post && (
              <span className="text-ui-text-muted">{` · ${detail.legal.director_post}`}</span>
            )}
          </div>
          <p className="text-small text-ui-text-muted">
            Руководитель по данным ЕГРЮЛ
            {generic.length > 0 ? ` — писать на общую почту ${generic[0]}` : ''}.
          </p>
        </div>
      ) : (
        <p className="text-small text-ui-text-muted">
          ЛПР ещё не найден. Во вкладке «Контакты» можно запустить поиск: сайт, hh.ru, ВКонтакте,
          ЕГРЮЛ.
        </p>
      )}
    </DrawerSection>
  );
}

function DecisionMakerContact({ dm }: { dm: DecisionMakerOut }) {
  if (!dm.contact_value) return null;
  const t = dm.contact_type ?? '';
  const href =
    t === 'email'
      ? `mailto:${dm.contact_value}`
      : t === 'phone'
        ? `tel:${dm.contact_value}`
        : dm.contact_value.startsWith('http')
          ? dm.contact_value
          : `https://${dm.contact_value}`;
  const Icon = t === 'email' ? Mail : t === 'phone' ? Phone : ExternalLink;
  return (
    <a
      href={href}
      target={t === 'email' || t === 'phone' ? undefined : '_blank'}
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-small font-semibold text-ui-accent hover:underline"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {dm.contact_value}
    </a>
  );
}

/* ===== Отзывы ===== */

function ReviewsView({
  detail,
  reviews,
  isLoading,
  tab,
  onTabChange,
  sourceTab,
  onSourceTabChange,
  textQuery,
  debouncedText,
  onTextQueryChange,
  onlyWithOwnerReply,
  onOnlyWithOwnerReplyChange,
  painLabel,
  onClearPain,
}: {
  detail: CompanyDetailOut;
  reviews: ReviewOut[];
  isLoading: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  sourceTab: SourceTab;
  onSourceTabChange: (tab: SourceTab) => void;
  textQuery: string;
  debouncedText: string;
  onTextQueryChange: (q: string) => void;
  onlyWithOwnerReply: boolean;
  onOnlyWithOwnerReplyChange: (v: boolean) => void;
  painLabel: string | null;
  onClearPain: () => void;
}) {
  const sourcesProfiles = detail.sources_profiles ?? [];
  // Счётчики тональности зависят от выбранного источника: берём их из профиля источника,
  // иначе при переключении они «застревают» на общих и кажется, что фильтр сломан.
  const activeProfile =
    sourceTab === 'all' ? null : (sourcesProfiles.find((s) => s.source === sourceTab) ?? null);
  const totalAll = activeProfile?.reviews_count ?? detail.reviews_count;
  const totalNeg = activeProfile?.reviews_negative_count ?? detail.reviews_negative_count;
  const totalPos = activeProfile?.reviews_positive_count ?? detail.reviews_positive_count;
  const hasActiveFilters =
    tab !== 'all' || sourceTab !== 'all' || debouncedText.length > 0 || onlyWithOwnerReply;
  const count = (n: number) => (n > 0 ? ` · ${n}` : '');

  return (
    <div className="space-y-3">
      {painLabel && (
        <div className="flex flex-wrap items-center gap-2 rounded-card bg-ui-danger/[.06] px-3 py-2 text-small">
          <span className="text-ui-text">
            Отзывы темы <strong>«{painLabel}»</strong>
          </span>
          <button
            type="button"
            onClick={onClearPain}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-ui-text-muted hover:text-ui-text"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Снять тему
          </button>
        </div>
      )}

      {/* Источник рендерим всегда (2026-06-12): у одноисточниковых компаний видно, откуда отзывы;
          недоступный у компании источник — неактивен. */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<SourceTab>
          aria-label="Источник отзывов"
          size="sm"
          value={sourceTab}
          onChange={onSourceTabChange}
          options={(['all', '2gis', 'yandex_maps'] as SourceTab[]).map((st) => {
            const sp = sourcesProfiles.find((s) => s.source === st);
            const label = st === 'all' ? 'Все источники' : sourceShortLabel(st);
            const available = st === 'all' || sp != null;
            return {
              value: st,
              label: `${label}${st !== 'all' && sp ? count(sp.reviews_count) : ''}`,
              disabled: !available,
              title: available ? undefined : `${label}: у компании нет отзывов из этого источника`,
            };
          })}
        />
        <Segmented<Tab>
          aria-label="Тональность отзывов"
          size="sm"
          value={tab}
          onChange={onTabChange}
          options={[
            { value: 'all', label: `Все${count(totalAll)}` },
            {
              value: 'negative',
              label: (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-ui-danger" aria-hidden />
                  Негатив{count(totalNeg)}
                </>
              ),
            },
            {
              value: 'positive',
              label: (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-ui-success" aria-hidden />
                  Позитив{count(totalPos)}
                </>
              ),
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-text-muted"
            aria-hidden
          />
          <Input
            type="text"
            aria-label="Поиск в тексте отзывов"
            placeholder="Слово в тексте отзыва"
            value={textQuery}
            onChange={(e) => onTextQueryChange(e.target.value)}
            className="pl-9 pr-9"
          />
          {textQuery && (
            <button
              type="button"
              onClick={() => onTextQueryChange('')}
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-control p-1 text-ui-text-muted hover:text-ui-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-small text-ui-text-muted">
          <input
            type="checkbox"
            checked={onlyWithOwnerReply}
            onChange={(e) => onOnlyWithOwnerReplyChange(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--color-accent))]"
          />
          С ответом владельца
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              onTabChange('all');
              onSourceTabChange('all');
              onTextQueryChange('');
              onOnlyWithOwnerReplyChange(false);
            }}
            className="text-small font-semibold text-ui-text-muted hover:text-ui-text"
          >
            Сбросить
          </button>
        )}
      </div>

      {hasActiveFilters && !isLoading && reviews.length > 0 && (
        <p className="text-xs text-ui-text-muted">
          Показано {reviews.length}
          {debouncedText ? ` · со словом «${debouncedText}»` : ''}
        </p>
      )}

      <ReviewsList
        reviews={reviews}
        isLoading={isLoading}
        highlight={debouncedText}
        emptyText={hasActiveFilters || painLabel ? 'Под эти фильтры отзывов нет.' : 'Отзывов нет.'}
      />
    </div>
  );
}

function ReviewsList({
  reviews,
  isLoading,
  highlight,
  emptyText,
}: {
  reviews: ReviewOut[];
  isLoading: boolean;
  highlight: string;
  emptyText: string;
}) {
  if (isLoading && reviews.length === 0) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-24" rounded="md" />
        <Skeleton className="h-24" rounded="md" />
        <span className="sr-only">Загрузка отзывов…</span>
      </div>
    );
  }
  if (reviews.length === 0) {
    return <p className="text-small text-ui-text-muted">{emptyText}</p>;
  }
  return (
    <ul
      className={cn('space-y-2 transition-opacity', isLoading && 'opacity-60')}
      aria-busy={isLoading || undefined}
    >
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} highlight={highlight} />
      ))}
    </ul>
  );
}

/* ===== Вспомогательное ===== */

/** Темы болей без дублей по названию и без безымянных кластеров. */
function uniquePainTags(tags: CompanyDetailOut['pain_tags'] | undefined) {
  const seen = new Set<string>();
  return (tags ?? []).filter((t) => {
    const k = (t.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k) || isUnnamedPainLabel(t.label)) return false;
    seen.add(k);
    return true;
  });
}

/** Сколько разных контактов у компании — для счётчика вкладки «Контакты». */
function countContacts(detail: CompanyDetailOut): number {
  const values = new Set<string>();
  const add = (v: string | null | undefined) => {
    const raw = (v ?? '').trim().toLowerCase();
    if (!raw) return;
    // Телефон в любом написании — одна запись: только цифры, 8 → 7.
    if (/^[\d\s()+-]{6,}$/.test(raw)) {
      values.add(raw.replace(/\D+/g, '').replace(/^8(\d{10})$/, '7$1'));
      return;
    }
    values.add(raw.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
  };
  const extra = (detail.contacts_extra ?? {}) as ContactsExtra;
  add(detail.phone);
  add(detail.website);
  (detail.emails ?? []).forEach(add);
  (detail.generic_emails ?? []).forEach(add);
  [extra.phones, extra.telegrams, extra.vks, extra.whatsapps].forEach((list) =>
    (list ?? []).forEach(add),
  );
  for (const p of detail.sources_profiles ?? []) (p.contacts ?? []).forEach((c) => add(c.value));
  for (const d of detail.decision_makers ?? []) add(d.contact_value);
  return values.size;
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
  // Блок 2 ТЗ 2026-06-02 — юр.данные из DaData. На free-тарифе DaData
  // revenue и employee_count всегда null — их вообще не показываем.
  //
  // 2026-06-12: даже если матч не нашёлся (legal === null) — рендерим
  // блок с пояснением, иначе юзер не понимает разницу «не загружено» vs
  // «нет в реестре». Пустое поле при найденном матче — «нет данных» серым.

  const missing = <span className="text-ui-text-muted">нет данных</span>;

  if (!legal) {
    return (
      <DrawerSection title="Юр. данные" tone="muted">
        <p className="text-small text-ui-text-muted">
          Не найдено в DaData — возможно, у компании нет юрлица (самозанятый или ИП без ОГРН) или
          название и адрес не совпали.
        </p>
      </DrawerSection>
    );
  }

  // Опорный набор полей — рисуем всегда, даже когда поле пустое.
  const items: { label: string; value: React.ReactNode; mono?: boolean }[] = [
    { label: 'ИНН', value: legal.inn || missing, mono: !!legal.inn },
    { label: 'ОГРН', value: legal.ogrn || missing, mono: !!legal.ogrn },
    {
      label: 'Юрлицо',
      value: legal.legal_short_name || legal.legal_name || missing,
    },
    {
      label: 'Возраст',
      value: typeof legal.age_years === 'number' ? `${legal.age_years} лет` : missing,
    },
    {
      label: 'Зарегистрирована',
      value: legal.registration_date || missing,
    },
    {
      label: 'Статус',
      value: legal.legal_status
        ? legal.legal_status === 'active'
          ? 'действующая'
          : legal.legal_status
        : missing,
    },
    {
      label: 'ОКВЭД',
      value: legal.okved_name ? `${legal.okved ?? ''} ${legal.okved_name}`.trim() : missing,
    },
    // ЛПР: ФИО + должность руководителя. У ИП руководителя в реестре может не быть.
    {
      label: 'Руководитель',
      value: legal.director_name
        ? `${legal.director_name}${legal.director_post ? `, ${legal.director_post}` : ''}`
        : missing,
    },
  ];

  // Поля платного тарифа DaData — только если есть значение.
  if (typeof legal.revenue === 'number' && legal.revenue > 0) {
    items.push({
      label: 'Оборот',
      value: `${(legal.revenue / 1_000_000).toFixed(1)} млн ₽`,
    });
  }
  if (typeof legal.employee_count === 'number' && legal.employee_count > 0) {
    items.push({ label: 'Сотрудников', value: legal.employee_count });
  }

  // Способ матча рядом с процентом — «почему именно эти юр. данные».
  const matchedByRu: Record<string, string> = {
    phone: 'по телефону',
    name_address: 'по названию и адресу',
    name_city: 'по названию и городу',
    inn: 'по ИНН',
    manual: 'вручную',
  };
  const matchedByLabel = legal.matched_by
    ? (matchedByRu[legal.matched_by] ?? legal.matched_by)
    : null;
  return (
    <DrawerSection
      title="Юр. данные"
      aside={
        typeof legal.match_confidence === 'number' ? (
          <span
            className={cn(
              'text-xs font-semibold',
              legal.match_confidence < 0.7 ? 'text-ui-warning' : 'text-ui-text-muted',
            )}
            title={
              `Уверенность совпадения DaData ↔ компания: ${(legal.match_confidence * 100).toFixed(0)}%. ` +
              `Способ: ${matchedByLabel ?? '—'}. ` +
              `100% — точное совпадение (например, по ИНН или телефону), ` +
              `меньше 70% — стоит проверить вручную, что юрлицо то же.`
            }
          >
            совпадение {(legal.match_confidence * 100).toFixed(0)}%
            {matchedByLabel ? ` · ${matchedByLabel}` : ''}
          </span>
        ) : undefined
      }
    >
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-small">
        {items.map((it) => (
          <React.Fragment key={it.label}>
            <dt className="text-ui-text-muted">{it.label}</dt>
            <dd className={cn('min-w-0 break-words text-ui-text', it.mono && 'font-mono')}>
              {it.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </DrawerSection>
  );
}

function ContactsBlock({
  detail,
  crawledOnly = false,
}: {
  detail: CompanyDetailOut;
  /** Только найденное на сайте компании (почта, мессенджеры) — для компаний с 2+ источниками,
   *  где телефон и сайт уже показаны в карточках источников. */
  crawledOnly?: boolean;
}) {
  const extra: ContactsExtra = (detail.contacts_extra ?? {}) as ContactsExtra;
  const emails: string[] = Array.isArray(detail.emails) ? detail.emails : [];

  // Телефоны: основной + extra.phones, без дублей по нормализованной форме.
  const phoneSet = new Map<string, string>();
  if (detail.phone && !crawledOnly) phoneSet.set(normalizePhone(detail.phone), detail.phone);
  for (const p of extra.phones ?? []) {
    const key = normalizePhone(p);
    if (key && !phoneSet.has(key)) phoneSet.set(key, p);
  }
  const phones = Array.from(phoneSet.values());

  const telegrams = (extra.telegrams ?? []).filter(Boolean);
  const vks = (extra.vks ?? []).filter(Boolean);
  const whatsapps = (extra.whatsapps ?? []).filter(Boolean);
  const website = crawledOnly ? null : detail.website;

  const hasAny =
    phones.length > 0 ||
    emails.length > 0 ||
    telegrams.length > 0 ||
    vks.length > 0 ||
    whatsapps.length > 0 ||
    !!website;

  // Ссылка на карточку источника — запасной путь, когда контактов нет совсем.
  // 2GIS: https://2gis.ru/firm/{external_id} — там обычно есть телефоны и мессенджеры.
  const sourceUrl = crawledOnly ? null : buildSourceUrl(detail.source, detail.external_id);

  if (!hasAny) {
    if (crawledOnly) return null;
    return (
      <DrawerSection title="Контакты" tone="muted">
        <p className="text-small text-ui-text-muted">
          Контактов от провайдера нет. 2GIS на нашем тарифе отдаёт телефоны не всегда, а мессенджеры
          не отдаёт — в исходной карточке обычно всё есть.
        </p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Открыть в {sourceLabel(detail.source)}
          </a>
        )}
      </DrawerSection>
    );
  }

  return (
    <DrawerSection title={crawledOnly ? 'С сайта компании' : 'Контакты'}>
      <div className="flex flex-col gap-2">
        {phones.map((p) => (
          <ContactRow key={`tel-${p}`} icon={<Phone />} href={`tel:${normalizePhone(p)}`}>
            {p}
          </ContactRow>
        ))}
        {emails.map((e) => (
          <ContactRow key={`mail-${e}`} icon={<Mail />} href={`mailto:${e}`}>
            {e}
          </ContactRow>
        ))}
        {website && (
          <ContactRow icon={<Globe />} href={website} external>
            {prettifyUrl(website)}
          </ContactRow>
        )}
        {telegrams.map((t) => {
          const handle = t.startsWith('@') ? t.slice(1) : t;
          return (
            <ContactRow
              key={`tg-${t}`}
              icon={<Send />}
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
            icon={<MessageCircle />}
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
              icon={<MessageCircle />}
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
            icon={<ExternalLink />}
            href={sourceUrl}
            external
            label={sourceShortLabel(detail.source)}
          >
            исходная карточка
          </ContactRow>
        )}
      </div>
    </DrawerSection>
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
// SourceMetricsBlock — «рейтинг × отзывы» по каждому источнику (Phase 5 multi-source).
// Расхождение между 2GIS и Я.Картами — полезный сигнал: вылетевшие отзывы
// в одном из них или разная аудитория.
// ---------------------------------------------------------------------------

function SourceMetricsBlock({ profiles }: { profiles: CompanyDetailOut['sources_profiles'] }) {
  const arr = profiles ?? [];
  if (arr.length < 2) return null;
  return (
    <DrawerSection title="По источникам">
      <table className="w-full text-small">
        <thead>
          <tr className="text-left text-xs text-ui-text-muted">
            <th className="pb-1.5 font-medium">Источник</th>
            <th className="pb-1.5 text-right font-medium">Рейтинг</th>
            <th className="pb-1.5 text-right font-medium">Отзывы</th>
            <th className="pb-1.5 text-right font-medium">Негатив</th>
          </tr>
        </thead>
        <tbody>
          {arr.map((p) => (
            <tr key={p.source} className="border-t border-ui-border">
              <td className="py-1.5 font-semibold text-ui-text">{sourceShortLabel(p.source)}</td>
              <td className="py-1.5 text-right text-ui-text">
                {typeof p.rating === 'number' ? p.rating.toFixed(1) : '—'}
              </td>
              <td className="py-1.5 text-right text-ui-text">{p.reviews_count}</td>
              <td
                className={cn(
                  'py-1.5 text-right',
                  p.reviews_negative_count > 0 ? 'text-ui-danger' : 'text-ui-text-muted',
                )}
              >
                {p.reviews_negative_count > 0 ? p.reviews_negative_count : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DrawerSection>
  );
}

// ---------------------------------------------------------------------------
// MultiSourceContactsBlock — контакты в РАЗДЕЛЁННЫХ секциях по источникам.
// Активен когда у компании ≥2 источниковых профиля (Phase 5 multi-source).
// Контакты внутри секции: основные (is_primary) первыми, потом дополнительные.
// Между секциями ничего не дедуплицируется — это ТЗ §1.3.
// ---------------------------------------------------------------------------

type ContactProfile = NonNullable<CompanyDetailOut['sources_profiles']>[number];

function MultiSourceContactsBlock({
  profiles,
}: {
  profiles: CompanyDetailOut['sources_profiles'];
}) {
  const arr = profiles ?? [];
  if (arr.length === 0) return null;
  return (
    <>
      {arr.map((p) => (
        <SourceContactsSection key={`${p.source}-${p.external_id}`} profile={p} />
      ))}
    </>
  );
}

function SourceContactsSection({ profile }: { profile: ContactProfile }) {
  const cs = profile.contacts ?? [];
  if (cs.length === 0 && !profile.source_url) return null;
  // Сортируем: primary первые, потом по типу phone→website→email→социалки.
  const order: Record<string, number> = {
    phone: 1,
    website: 2,
    email: 3,
    telegram: 4,
    whatsapp: 5,
    vk: 6,
    instagram: 7,
    facebook: 8,
    ok: 9,
    youtube: 10,
  };
  const sorted = [...cs].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (order[a.type] ?? 99) - (order[b.type] ?? 99);
  });
  const deepLink = buildSourceUrl(profile.source, profile.external_id);
  return (
    <DrawerSection
      title={`Контакты · ${sourceShortLabel(profile.source)}`}
      aside={
        deepLink ? (
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ui-accent hover:underline"
          >
            Открыть в {sourceShortLabel(profile.source)}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : undefined
      }
    >
      {sorted.length > 0 ? (
        <div className="flex flex-col gap-2">
          {sorted.map((c, idx) => (
            <ContactValueRow key={`${c.type}-${c.value}-${idx}`} contact={c} />
          ))}
        </div>
      ) : (
        <p className="text-small text-ui-text-muted">
          {profile.source === '2gis'
            ? 'Каталог 2GIS не отдал контакты — откройте исходную карточку.'
            : 'Контактов с карточки Я.Карт не получено.'}
        </p>
      )}
    </DrawerSection>
  );
}

function ContactValueRow({ contact }: { contact: ContactProfile['contacts'][number] }) {
  const { type, value } = contact;
  if (type === 'phone') {
    return (
      <ContactRow icon={<Phone />} href={`tel:${normalizePhone(value)}`}>
        {value}
      </ContactRow>
    );
  }
  if (type === 'email') {
    return (
      <ContactRow icon={<Mail />} href={`mailto:${value}`}>
        {value}
      </ContactRow>
    );
  }
  if (type === 'website') {
    return (
      <ContactRow icon={<Globe />} href={value} external>
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
        icon={<Send />}
        href={value.startsWith('http') ? value : `https://t.me/${handle}`}
        external
        label="Telegram"
      >
        @{handle}
      </ContactRow>
    );
  }
  if (type === 'whatsapp') {
    const href = value.startsWith('http') ? value : `https://wa.me/${value.replace(/\D/g, '')}`;
    return (
      <ContactRow icon={<MessageCircle />} href={href} external label="WhatsApp">
        {value}
      </ContactRow>
    );
  }
  if (
    type === 'vk' ||
    type === 'instagram' ||
    type === 'facebook' ||
    type === 'ok' ||
    type === 'youtube'
  ) {
    const href = value.startsWith('http') ? value : `https://${value}`;
    return (
      <ContactRow icon={<MessageCircle />} href={href} external label={type}>
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
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ui-surface-2 text-ui-text-muted [&_svg]:h-3.5 [&_svg]:w-3.5"
        aria-hidden
      >
        {icon}
      </span>
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className="min-w-0 truncate text-sm font-medium text-ui-text hover:text-ui-accent hover:underline"
      >
        {children}
      </a>
      {label && <span className="ml-auto shrink-0 text-xs text-ui-text-muted">{label}</span>}
    </div>
  );
}

function prettifyUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// ReviewCard
// ---------------------------------------------------------------------------

function ReviewCard({ review, highlight }: { review: ReviewOut; highlight: string }) {
  const sentiment = review.sentiment as 'positive' | 'negative' | 'neutral' | null;
  const source = review.source ? sourceShortLabel(review.source) : null;

  return (
    <li className="rounded-card border border-ui-border bg-ui-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ui-text-muted">
        <span className="font-semibold text-ui-text">{review.author_masked || 'Аноним'}</span>
        {review.rating != null && <StarRating value={review.rating} />}
        {review.posted_at && <span>{new Date(review.posted_at).toLocaleDateString('ru-RU')}</span>}
        {source && <span>· {source}</span>}
        {sentiment === 'negative' && (
          <Badge size="sm" tone="danger">
            негатив
          </Badge>
        )}
        {sentiment === 'positive' && (
          <Badge size="sm" tone="success">
            позитив
          </Badge>
        )}
        {review.has_owner_reply && (
          <Badge size="sm" tone="info">
            есть ответ владельца
          </Badge>
        )}
        {review.source_url && (
          <a
            href={review.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-0.5 font-semibold hover:text-ui-accent"
          >
            оригинал
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
      {review.raw_text == null ? (
        <p className="text-sm text-ui-text-muted">Текст удалён по политике хранения.</p>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ui-text">
          {highlight ? (
            <HighlightedText text={review.raw_text} needle={highlight} />
          ) : (
            review.raw_text
          )}
        </p>
      )}
      {Array.isArray(review.pain_tags) && review.pain_tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {review.pain_tags
            .filter((t) => !isUnnamedPainLabel(t.label))
            .map((t) => (
              <span
                key={t.id}
                className="rounded-full bg-ui-surface-2 px-2.5 py-0.5 text-xs text-ui-text-muted"
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
  // value 1..5; первые value звёзд — жёлтые, остальные — серые
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Оценка ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            'h-3 w-3',
            i <= value ? 'fill-signal-warm text-signal-warm' : 'text-ui-border',
          )}
        />
      ))}
    </span>
  );
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

function HighlightedText({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  // Регистронезависимое разбиение по needle; спецсимволы экранируем.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} className="rounded bg-ui-warning/20 px-0.5 text-ui-text">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ЛПР со страниц сайта / ВК / hh / ЕГРЮЛ (ТЗ A.2 2026-06-04 + ТЗ
// Marketing-DM 2026-06-20). decision_makers[] — массив, отсортированный
// API по убыванию is_decision_maker + confidence. Если пуст —
// компонент не рендерится.
// Плашки «Проверено»: показывают юзеру, какие из 5 источников оркестратор
// смог разобрать и сколько кандидатов пришло из каждого. Даёт прозрачность —
// вместо молчаливого «не нашли» видно «сайт: 0, ВК: 1, hh: 0, ЕГРЮЛ: 1».
type EnrichSourceKey = 'website' | 'vk' | 'hh' | 'egrul';

function SourcesCheckedStrip({
  decisionMakers,
  legalMatchConfidence,
  hiringMarketing,
  onSourceRetry,
  triggeringSources,
}: {
  decisionMakers: DecisionMakerOut[];
  legalMatchConfidence: number | null;
  hiringMarketing: boolean;
  /** Клик по плашке источника — просит родителя запустить конкретный
   *  source-таск. Если undefined — плашки статичные. Плашки НЕЗАВИСИМЫ:
   *  можно кликать несколько подряд, каждая крутится своим счётчиком. */
  onSourceRetry?: (source: EnrichSourceKey) => void | Promise<void>;
  /** Set источников, у которых сейчас в полёте idem-запрос. Плашка
   *  disabled только для источника из этого set — остальные всегда
   *  доступны для клика, даже уже «✓ найдено» (перепарсинг). */
  triggeringSources?: Set<EnrichSourceKey> | null;
}) {
  const countBy = (prefixes: string[]) =>
    decisionMakers.filter((d) => prefixes.some((p) => d.source === p || d.source.startsWith(p)))
      .length;
  const website = countBy([
    'website_team',
    'website_about',
    'website_contacts',
    'website_partnership',
    'website_career',
  ]);
  const vk = countBy(['vk']);
  const hh = countBy(['hh']);
  const egrul = countBy(['egrul_director', 'egrul_founder']);
  const dadata = legalMatchConfidence != null;

  // Плашка. 3 состояния:
  //  - triggering: спиннер + «ищем…» disabled (только эта плашка, остальные живут)
  //  - found (count>0): галочка + N, по клику ре-парсинг источника (перепроверить)
  //  - empty (count===0): круг/стрелка — по клику запуск парсера
  // Все клики независимы, глобального lock'а больше нет.
  const chip = (
    label: string,
    count: number,
    sourceKey: EnrichSourceKey | null,
    extra?: string,
  ) => {
    const found = count > 0;
    const isTriggering = sourceKey != null && !!triggeringSources?.has(sourceKey);
    const clickable = !isTriggering && !!onSourceRetry && sourceKey != null;
    const baseCls = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ';
    const stateCls = isTriggering
      ? 'bg-[var(--signal-warm-bg)] text-signal-warm'
      : found
        ? clickable
          ? 'cursor-pointer bg-[var(--signal-good-bg)] text-signal-good hover:opacity-80'
          : 'bg-[var(--signal-good-bg)] text-signal-good'
        : clickable
          ? 'cursor-pointer bg-ui-surface-2 text-ui-text-muted hover:bg-ui-accent/10 hover:text-ui-accent'
          : 'bg-ui-surface-2 text-ui-text-muted';
    const content = (
      <>
        <span aria-hidden>
          {isTriggering ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : found ? (
            <Check className="h-3 w-3" />
          ) : clickable ? (
            <RotateCw className="h-3 w-3" />
          ) : (
            <Circle className="h-3 w-3" />
          )}
        </span>
        <span>{label}</span>
        {found && <span className="opacity-70">· {count}</span>}
        {isTriggering && <span className="opacity-70">· ищем…</span>}
        {extra && <span className="opacity-70">· {extra}</span>}
      </>
    );
    const title = isTriggering
      ? `${label}: запущен поиск, ~1 мин`
      : found
        ? clickable
          ? `${label}: найдено ${count} — кликните, чтобы перепроверить`
          : `${label}: найдено ${count}`
        : clickable
          ? `${label}: пусто — кликните, чтобы запустить парсер`
          : `${label}: пусто`;
    if (clickable) {
      return (
        <button
          type="button"
          onClick={() => onSourceRetry!(sourceKey!)}
          className={baseCls + stateCls}
          title={title}
        >
          {content}
        </button>
      );
    }
    return (
      <span className={baseCls + stateCls} title={title}>
        {content}
      </span>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-0.5 font-semibold uppercase tracking-wide text-ui-text-muted">
        Проверено:
      </span>
      {chip('сайт', website, 'website')}
      {chip('ВК', vk, 'vk')}
      {chip('hh.ru', hh, 'hh', hiringMarketing ? 'ищет маркетолога' : undefined)}
      {chip('ЕГРЮЛ', egrul, 'egrul')}
      <span
        className={
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
          (dadata
            ? 'bg-[var(--signal-good-bg)] text-signal-good'
            : 'bg-ui-surface-2 text-ui-text-muted')
        }
        title={
          dadata
            ? `DaData: юр.данные сматчены на ${Math.round((legalMatchConfidence ?? 0) * 100)}%`
            : 'DaData: юр.лицо не сматчено (перезапуск через плашку ЕГРЮЛ)'
        }
      >
        <span aria-hidden>
          {dadata ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
        </span>
        <span>DaData</span>
        {dadata && (
          <span className="opacity-70">· {Math.round((legalMatchConfidence ?? 0) * 100)}%</span>
        )}
      </span>
    </div>
  );
}

function DecisionMakersBlock({
  decisionMakers,
  onFindDm,
  dmEnrichPending,
  dmEnrichResult,
  searchExhausted,
  legalMatchConfidence,
  hiringMarketing,
  legalDirectorName,
  legalDirectorPost,
  genericEmails,
  onSourceRetry,
  triggeringSources,
}: {
  decisionMakers: DecisionMakerOut[];
  /** undefined = кнопка «Найти ЛПР» не показывается. По умолчанию
   *  показывается всегда — 2026-07-16 разрешили и на /app/pains. */
  onFindDm?: () => void;
  dmEnrichPending: boolean;
  dmEnrichResult: string | null;
  /** true после 55с ожидания если поиск ничего не нашёл. UI покажет явно
   *  «не нашли», а не заново кнопку. */
  searchExhausted?: boolean;
  legalMatchConfidence?: number | null;
  hiringMarketing?: boolean;
  legalDirectorName?: string | null;
  legalDirectorPost?: string | null;
  /** 2026-07-16: общая почта компании (info@, contact@ …). Fallback-канал,
   *  когда персонального ЛПР с контактом не нашли. */
  genericEmails?: string[];
  /** Клик по плашке источника — родитель триггерит source-task и
   *  рефетчит drawer через 55с. */
  onSourceRetry?: (source: EnrichSourceKey) => void | Promise<void>;
  /** 2026-07-16: НЕЗАВИСИМЫЕ плашки — set источников, у которых сейчас
   *  в полёте idem-запрос. Остальные плашки всегда кликабельны. */
  triggeringSources?: Set<EnrichSourceKey> | null;
}) {
  const generic = (genericEmails ?? []).filter(Boolean);
  // Общий блок «Общая почта компании» — переиспользуем в empty-state и как
  // подсказку под ЛПР без личного контакта.
  const renderGenericMails = (variant: 'warn' | 'neutral' = 'neutral') => {
    if (generic.length === 0) return null;
    const box =
      variant === 'warn'
        ? 'rounded border border-[color:var(--signal-warm)]/40 bg-ui-surface/60 px-2 py-1.5'
        : 'rounded border border-ui-border bg-ui-surface/60 px-2 py-1.5';
    const textCls = variant === 'warn' ? 'text-signal-warm' : 'text-ui-text-muted';
    return (
      <div className={`${box} text-xs ${textCls}`}>
        <div className="mb-0.5 flex items-center gap-1.5 font-medium">
          <Mail className="h-4 w-4 shrink-0" aria-hidden />
          Общая почта компании
          <span className="ml-1 rounded bg-ui-surface-2 px-1 text-xs uppercase tracking-wide text-ui-text-muted">
            общая
          </span>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {generic.map((e) => (
            <a
              key={`gm-${e}`}
              href={`mailto:${e}`}
              onClick={(ev) => ev.stopPropagation()}
              className="text-ui-accent hover:underline"
              title={`Написать на общую почту: ${e}`}
            >
              {e}
            </a>
          ))}
        </div>
      </div>
    );
  };

  // Если родитель не дал onFindDm (напр. drawer открыт из /app/pains
  // без search_id) и ЛПР нет — прячем весь блок ТОЛЬКО если и общей
  // почты нет. Иначе покажем маленький блок «Общая почта компании».
  if (!onFindDm && (!decisionMakers || decisionMakers.length === 0)) {
    if (generic.length === 0) return null;
    return (
      <div className="rounded-card border border-ui-border bg-ui-surface-2 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ui-text-muted">
          Кто за маркетинг
        </div>
        <div className="mb-2 text-xs text-ui-text-muted">
          Персонального ЛПР пока нет. Пиши на общую почту — попадёшь в общую переписку компании.
        </div>
        {renderGenericMails('neutral')}
      </div>
    );
  }
  // Пусто → показываем кнопку «Найти ЛПР» или «не нашли», если поиск уже
  // отработал вхолостую (2026-07-10 fix — юзер жаловался на «нажал → пусто»).
  if (!decisionMakers || decisionMakers.length === 0) {
    if (searchExhausted) {
      return (
        <div className="rounded-card border border-[color:var(--signal-warm)]/40 bg-[var(--signal-warm-bg)] p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-signal-warm">
            Кто за маркетинг
          </div>
          <div className="mb-2 text-xs text-signal-warm">
            Не нашли ЛПР ни в одном источнике. У компании нет активных вакансий на hh.ru,
            привязанного VK-сообщества и данных в ЕГРЮЛ. Попробуй запустить снова позже — источники
            обновляются.
          </div>
          <div className="mb-2">
            <SourcesCheckedStrip
              decisionMakers={decisionMakers}
              legalMatchConfidence={legalMatchConfidence ?? null}
              hiringMarketing={hiringMarketing ?? false}
              onSourceRetry={onSourceRetry}
              triggeringSources={triggeringSources ?? null}
            />
          </div>
          {legalDirectorName && (
            <div className="mb-2 rounded border border-[color:var(--signal-warm)]/40 bg-ui-surface/60 px-2 py-1.5 text-xs text-signal-warm">
              <User className="mr-1 inline h-4 w-4" aria-hidden />
              <span className="font-medium">Из DaData известен только руководитель:</span>{' '}
              {legalDirectorName}
              {legalDirectorPost && (
                <span className="text-signal-warm">{` · ${legalDirectorPost}`}</span>
              )}
              <div className="text-signal-warm">
                Можно писать на общую почту компании, обращаясь к нему.
              </div>
            </div>
          )}
          {/* Общая почта — fallback-канал, когда персональный ЛПР не нашёлся.
              Показываем прямо в amber-баннере, чтобы было куда писать сейчас. */}
          {generic.length > 0 && <div className="mb-2">{renderGenericMails('warn')}</div>}
          <button
            type="button"
            onClick={onFindDm}
            disabled={dmEnrichPending}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            {dmEnrichPending ? (
              'Поиск…'
            ) : (
              <>
                <RotateCw className="h-4 w-4" aria-hidden />
                Попробовать снова
              </>
            )}
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-card border border-ui-border bg-ui-surface-2 p-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ui-text-muted">
          Кто за маркетинг
        </div>
        <div className="mb-2 text-xs text-ui-text-muted">
          ЛПР ещё не найден. Запустить поиск (сайт /team, hh.ru, ВК, ЕГРЮЛ).
        </div>
        {generic.length > 0 && <div className="mb-2">{renderGenericMails('neutral')}</div>}
        <button
          type="button"
          onClick={onFindDm}
          disabled={dmEnrichPending}
          className={buttonClass({ size: 'sm' })}
        >
          {dmEnrichPending ? (
            'Поиск… (~1 мин)'
          ) : (
            <>
              <Target className="h-4 w-4" aria-hidden />
              Найти ЛПР
            </>
          )}
        </button>
        {dmEnrichResult && <div className="mt-2 text-xs text-ui-text-muted">{dmEnrichResult}</div>}
      </div>
    );
  }
  // ТЗ Marketing-DM §4.1: сверху выделенный блок «Кто за маркетинг» —
  // единственная выбранная оркестратором персона (is_marketing_dm=true),
  // либо фолбэк-руководитель если маркетолога не нашли.
  const marketingDm = decisionMakers.find((d) => d.is_marketing_dm) ?? null;
  const rest = decisionMakers.filter((d) => d !== marketingDm);
  // 2026-07-10: топ-3 альтернативных кандидата с публичным контактом
  // (email/phone/vk). Юзеру полезно видеть их отдельно на случай если
  // marketingDm недоступен или для повторного касания через другой канал.
  const alternativesWithContact = rest
    .filter((d) => d.contact_value && d.contact_value.trim())
    .sort((a, b) => {
      // 1) is_decision_maker=true → приоритет
      if (a.is_decision_maker !== b.is_decision_maker) {
        return a.is_decision_maker ? -1 : 1;
      }
      // 2) confidence desc
      const ac = typeof a.confidence === 'number' ? a.confidence : 0;
      const bc = typeof b.confidence === 'number' ? b.confidence : 0;
      return bc - ac;
    })
    .slice(0, 3);
  const alternativeIds = new Set(alternativesWithContact.map((d) => d.name));
  // 2026-07-16: reviews_ner-персоны — это упоминания клиентов из отзывов
  // («спасибо Марине из маркетинга»). Они НЕ ЛПР по определению — это
  // слабый шумный источник. Показываем их отдельным блоком «Упомянуты в
  // отзывах» с честным disclaimer'ом, чтобы юзер не путал врачей из
  // отзывов с реальными маркетинг-ЛПР.
  const reviewsMentions = rest.filter(
    (d) => d.source === 'reviews_ner' && !alternativeIds.has(d.name),
  );
  const nonReview = rest.filter((d) => d.source !== 'reviews_ner');
  const dms = nonReview.filter((d) => d.is_decision_maker && !alternativeIds.has(d.name));
  const others = nonReview.filter((d) => !d.is_decision_maker && !alternativeIds.has(d.name));

  const sourceLabel: Record<string, string> = {
    website_team: 'команда сайта',
    website_about: 'страница «о нас»',
    website_contacts: 'контакты сайта',
    website_partnership: 'страница партнёров/рекламы',
    website_career: 'страница вакансий',
    vk: 'ВКонтакте',
    hh: 'hh.ru',
    egrul_director: 'ЕГРЮЛ (директор)',
    egrul_founder: 'ЕГРЮЛ (учредитель)',
    egrn: 'ЕГРН (собственник)',
    // 2026-07-16 (вечер): 5 источников NER-типа, добавленных за один день.
    reviews_ner: 'из отзывов',
    owner_reply: 'из ответа владельца',
    telegram_bio: 'из Telegram-био',
    checko: 'checko.ru',
    serp_google: 'из Google-поиска',
  };
  // Винительный падеж — «фолбэк на кого?»: маркетолога / владельца / …
  const roleLabel: Record<string, string> = {
    marketing: 'маркетолога',
    owner: 'владельца',
    founder: 'учредителя',
    management: 'руководителя',
    hr: 'HR',
  };

  // Обёртка для отрисовки контакта из contact_type/contact_value.
  const renderContact = (d: DecisionMakerOut) => {
    if (!d.contact_value) return null;
    const t = d.contact_type ?? '';
    let href = d.contact_value;
    if (t === 'email') href = `mailto:${d.contact_value}`;
    else if (t === 'phone') href = `tel:${d.contact_value}`;
    else if (t === 'vk' || t === 'site') {
      href = d.contact_value.startsWith('http') ? d.contact_value : `https://${d.contact_value}`;
    }
    const icon =
      t === 'email' ? (
        <Mail className="h-4 w-4" aria-hidden />
      ) : t === 'phone' ? (
        <Phone className="h-4 w-4" aria-hidden />
      ) : (
        <ExternalLink className="h-4 w-4" aria-hidden />
      );
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-ui-accent hover:underline"
        title={`Написать: ${d.contact_value}`}
      >
        {icon}
        <span>{d.contact_value}</span>
      </a>
    );
  };

  // 2026-07-11: «Ближайший кандидат» — если оркестратор не выбрал marketing_dm,
  // но в rest есть кандидат с ролью owner/founder/management, показываем его
  // явно (а не только amber-баннер «маркетинг не найден»). Юзеру видно
  // альтернативу сразу, не нужно скроллить в «Прочие ЛПР».
  const rolePriority: Record<string, number> = {
    owner: 3,
    founder: 3,
    management: 2,
    hr: 1,
  };
  const nearestCandidate = !marketingDm
    ? ([...rest]
        .filter((d) => d.role_category && rolePriority[d.role_category] !== undefined)
        .sort((a, b) => {
          const ap = rolePriority[a.role_category ?? ''] ?? 0;
          const bp = rolePriority[b.role_category ?? ''] ?? 0;
          if (ap !== bp) return bp - ap;
          const ac = typeof a.confidence === 'number' ? a.confidence : 0;
          const bc = typeof b.confidence === 'number' ? b.confidence : 0;
          return bc - ac;
        })[0] ?? null)
    : null;

  return (
    <div className="space-y-2">
      {/* Если оркестратор не выбрал маркетинг-ЛПР — предлагаем ре-триггер.
          Это ловит legacy-компании (парсились до этой ветки). */}
      {!marketingDm && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-[color:var(--signal-warm)]/40 bg-[var(--signal-warm-bg)] px-3 py-2">
          <span className="text-xs text-signal-warm">
            Маркетинг-ЛПР ещё не выбран. Запустить поиск?
          </span>
          <button
            type="button"
            onClick={onFindDm}
            disabled={dmEnrichPending}
            className={buttonClass({ size: 'sm', className: 'shrink-0' })}
          >
            {dmEnrichPending ? (
              'Поиск…'
            ) : (
              <>
                <Target className="h-4 w-4" aria-hidden />
                Найти ЛПР
              </>
            )}
          </button>
        </div>
      )}
      {dmEnrichResult && !marketingDm && (
        <div className="text-xs text-ui-text-muted">{dmEnrichResult}</div>
      )}
      {/* Ближайший кандидат — фолбэк на владельца/директора, когда маркетолога
          нет. Пусть юзер увидит имя+контакт+вероятность в одном месте. */}
      {!marketingDm && nearestCandidate && (
        <div className="rounded-card border border-[color:var(--signal-cool)]/40 bg-[var(--signal-cool-bg)] p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-signal-cool">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-4 w-4" aria-hidden />
              Ближайший кандидат
            </span>
            <span
              className="rounded-full bg-[var(--signal-cool-bg)] px-2 py-0.5 text-xs font-normal normal-case tracking-normal text-signal-cool"
              title="Маркетолог не найден — предлагаем ЛПР со смежной ролью"
            >
              роль:{' '}
              {roleLabel[nearestCandidate.role_category ?? ''] ?? nearestCandidate.role_category}
            </span>
          </div>
          <div className="text-small">
            <span className="font-medium text-ui-text">{nearestCandidate.name}</span>
            {nearestCandidate.post && (
              <span className="text-ui-text-muted">{` · ${nearestCandidate.post}`}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ui-text-muted">
            {nearestCandidate.source_url ? (
              <a
                href={nearestCandidate.source_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 rounded bg-ui-surface-2 px-1.5 py-0.5 hover:bg-ui-border"
                title={`Открыть источник: ${sourceLabel[nearestCandidate.source] ?? nearestCandidate.source}`}
              >
                <span>{sourceLabel[nearestCandidate.source] ?? nearestCandidate.source}</span>
                <span aria-hidden>↗</span>
              </a>
            ) : (
              <span
                className="rounded bg-ui-surface-2 px-1.5 py-0.5"
                title={`Источник: ${sourceLabel[nearestCandidate.source] ?? nearestCandidate.source}`}
              >
                {sourceLabel[nearestCandidate.source] ?? nearestCandidate.source}
              </span>
            )}
            {typeof nearestCandidate.confidence === 'number' && (
              <span
                title="Уверенность оркестратора, что это реальный ЛПР этой компании"
                className={
                  nearestCandidate.confidence >= 0.8
                    ? 'text-signal-good'
                    : nearestCandidate.confidence >= 0.6
                      ? 'text-signal-warm'
                      : 'text-ui-text-muted'
                }
              >
                уверенность {Math.round(nearestCandidate.confidence * 100)}%
              </span>
            )}
          </div>
          <div className="mt-2">
            {renderContact(nearestCandidate) ?? (
              <span className="text-xs italic text-ui-text-muted">
                публичного контакта нет — пишите по общей почте компании
              </span>
            )}
          </div>
        </div>
      )}
      {/* Прозрачность источников — какие оркестратор смог собрать.
          Плашки с ○ кликабельны — запускают конкретный source-парсер
          повторно (2026-07-11 юзерский запрос). */}
      <SourcesCheckedStrip
        decisionMakers={decisionMakers}
        legalMatchConfidence={legalMatchConfidence ?? null}
        hiringMarketing={hiringMarketing ?? false}
        onSourceRetry={onSourceRetry}
        triggeringSources={triggeringSources ?? null}
      />
      {/* Выделенный блок целевого маркетинг-ЛПР (ТЗ §4.1) */}
      {marketingDm && (
        <div className="rounded-card border border-ui-accent/30 bg-ui-accent/[.04] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ui-accent">
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-4 w-4" aria-hidden />
              Кто за маркетинг
            </span>
            {marketingDm.role_category && marketingDm.role_category !== 'marketing' && (
              <span
                className="rounded-full bg-[var(--signal-warm-bg)] px-2 py-0.5 text-xs font-normal normal-case tracking-normal text-signal-warm"
                title="Маркетолог не найден — контакт руководителя как фолбэк"
              >
                фолбэк на {roleLabel[marketingDm.role_category] ?? 'руководителя'}
              </span>
            )}
          </div>
          <div className="text-small">
            <span className="font-medium text-ui-text">{marketingDm.name}</span>
            {marketingDm.post && (
              <span className="text-ui-text-muted">{` · ${marketingDm.post}`}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ui-text-muted">
            <span
              className="rounded bg-ui-surface-2 px-1.5 py-0.5"
              title={`Источник: ${sourceLabel[marketingDm.source] ?? marketingDm.source}`}
            >
              {sourceLabel[marketingDm.source] ?? marketingDm.source}
            </span>
            {typeof marketingDm.confidence === 'number' && (
              <span
                title="Уверенность оркестратора"
                className={
                  marketingDm.confidence >= 0.8
                    ? 'text-signal-good'
                    : marketingDm.confidence >= 0.6
                      ? 'text-signal-warm'
                      : 'text-ui-text-muted'
                }
              >
                уверенность {Math.round(marketingDm.confidence * 100)}%
              </span>
            )}
            {marketingDm.egrn_matches_founder === true && (
              <span
                className="text-signal-good"
                title="Собственник помещения (ЕГРН) совпадает с учредителем (ЕГРЮЛ)"
              >
                ✓ подтверждён ЕГРН
              </span>
            )}
          </div>
          <div className="mt-2 space-y-1.5">
            {renderContact(marketingDm) ?? (
              <span className="text-xs italic text-ui-text-muted">
                публичного контакта нет — напишите по общей почте компании
              </span>
            )}
            {/* Общая почта компании (info@/contact@) — доступна и здесь как
                независимый канал для второго касания или как fallback,
                если у ЛПР contact_value=None. */}
            {generic.length > 0 && renderGenericMails('neutral')}
          </div>
          {marketingDm.source_url && (
            <a
              href={marketingDm.source_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-block text-xs text-ui-text-muted hover:text-ui-accent"
            >
              открыть источник ↗
            </a>
          )}
        </div>
      )}

      {/* Альтернативные кандидаты С КОНТАКТОМ — топ-3 (2026-07-10).
          Если marketingDm без контакта или юзер хочет второе касание —
          вот готовые адреса для outreach. */}
      {marketingDm && alternativesWithContact.length > 0 && (
        <div className="rounded-card border border-[color:var(--signal-good)]/40 bg-[var(--signal-good-bg)] p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-signal-good">
            <Phone className="h-4 w-4" aria-hidden />
            Другие контакты для касания
          </div>
          <ul className="space-y-1.5">
            {alternativesWithContact.map((d, i) => (
              <li key={`alt-${d.name}-${i}`} className="text-xs">
                <span className="font-medium text-ui-text">{d.name}</span>
                {d.post && <span className="text-ui-text-muted">{` · ${d.post}`}</span>}
                {d.source_url ? (
                  <a
                    href={d.source_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="ml-2 inline-flex items-center gap-0.5 rounded bg-[var(--signal-good-bg)] px-1.5 py-0.5 text-xs text-signal-good hover:opacity-80"
                    title={`Открыть источник: ${sourceLabel[d.source] ?? d.source}`}
                  >
                    <span>{sourceLabel[d.source] ?? d.source}</span>
                    <span aria-hidden>↗</span>
                  </a>
                ) : (
                  <span
                    className="ml-2 rounded bg-[var(--signal-good-bg)] px-1.5 py-0.5 text-xs text-signal-good"
                    title={sourceLabel[d.source] ?? d.source}
                  >
                    {sourceLabel[d.source] ?? d.source}
                  </span>
                )}
                {typeof d.confidence === 'number' && (
                  <span
                    className="ml-1 text-xs text-ui-text-muted"
                    title="Уверенность оркестратора"
                  >
                    {Math.round(d.confidence * 100)}%
                  </span>
                )}
                {renderContact(d)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Найденные ЛПР / сотрудники с сайта, ВК, hh, ЕГРЮЛ. Отзывы —
          отдельный блок ниже, потому что это шумный источник и врачи из
          отзывов ЛПР НЕ являются.
          2026-07-16 (юзер): убрать слово «ЛПР» из заголовка когда там не
          обязательно ЛПР — писать «Прочие упоминающиеся люди» вместо
          «Прочие найденные ЛПР». */}
      {(dms.length > 0 || others.length > 0) &&
        (() => {
          // Динамический заголовок:
          //   - есть dms → «Прочие упоминающиеся люди» (если marketingDm) /
          //     «Найденные люди» (если marketingDm нет)
          //   - только others → «Прочие упоминающиеся люди (не ЛПР)»
          const list = dms.length > 0 ? dms : others;
          const heading =
            dms.length > 0
              ? marketingDm
                ? 'Прочие упоминающиеся люди'
                : 'Найденные люди'
              : 'Прочие упоминающиеся люди (не ЛПР)';
          return (
            <div className="rounded-card border border-[color:var(--signal-good)]/30 bg-[var(--signal-good-bg)] p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--signal-good)]">
                {heading}
              </div>
              <ul className="space-y-1.5">
                {list.map((d, i) => (
                  <li key={`${d.name}-${i}`} className="text-xs">
                    <span className="font-medium text-ui-text">{d.name}</span>
                    {d.post && <span className="text-ui-text-muted">{` · ${d.post}`}</span>}
                    <span
                      className="ml-2 rounded bg-ui-surface-2 px-1.5 py-0.5 text-xs text-ui-text-muted"
                      title={sourceLabel[d.source] ?? d.source}
                    >
                      {sourceLabel[d.source] ?? d.source}
                    </span>
                    {typeof d.confidence === 'number' && (
                      <span
                        className="ml-1 text-xs text-ui-text-muted"
                        title="Уверенность оркестратора"
                      >
                        {Math.round(d.confidence * 100)}%
                      </span>
                    )}
                    {renderContact(d)}
                    {d.source_url && !d.contact_value && (
                      <a
                        href={d.source_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-1 text-xs uppercase tracking-wider text-ui-text-muted hover:text-ui-accent"
                        title={sourceLabel[d.source] ?? d.source}
                      >
                        ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {dms.length > 0 && others.length > 0 && (
                <details className="mt-2 text-xs text-ui-text-muted">
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
        })()}

      {/* 2026-07-16: имена, упомянутые клиентами в отзывах (LLM-NER по
          raw_text). Явный disclaimer: это НЕ ЛПР, это работники, которых
          упоминали клиенты. Может пригодиться для персонализации письма
          («Здравствуйте, Марина!»), но полагаться на них как на решение
          нельзя. */}
      {reviewsMentions.length > 0 && (
        <details className="rounded-card border border-ui-border bg-ui-surface-2 p-4">
          <summary className="flex cursor-pointer flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ui-text-muted">
            <MessageSquare className="h-4 w-4" aria-hidden />
            Упомянуты в отзывах ({reviewsMentions.length})
            <span className="ml-2 rounded bg-ui-surface-2 px-1.5 py-0.5 text-xs normal-case tracking-normal text-ui-text-muted">
              не ЛПР — сотрудники по упоминанию клиентов
            </span>
          </summary>
          <div className="mt-2 text-xs text-ui-text-muted">
            Имена, которые клиенты называют в отзывах («спасибо Марине»). Если это
            врач/мастер/администратор — это НЕ маркетинг-ЛПР, но имя можно использовать в
            приветствии письма.
          </div>
          <ul className="mt-2 space-y-1">
            {reviewsMentions.map((d, i) => (
              <li key={`rev-${d.name}-${i}`} className="text-xs">
                <span className="font-medium text-ui-text">{d.name}</span>
                {d.post && <span className="text-ui-text-muted">{` · ${d.post}`}</span>}
                {typeof d.confidence === 'number' && (
                  <span
                    className="ml-1 text-xs text-ui-text-muted"
                    title="Уверенность NER-парсера. Низкая ⇒ упомянут пару раз, высокая ⇒ упомянут в нескольких отзывах."
                  >
                    {Math.round(d.confidence * 100)}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Диапазон дат + помесячный график для выбранной боли.
 * Юзер 2026-06-10:
 *   - 3-A: «12.03–28.05» рядом с темой (first_review_at..last_review_at)
 *   - 3-C: график с разбивкой по источнику (2GIS / Я.Карты), фильтр
 *     синхронизирован с источником во вкладке «Отзывы».
 *
 * Столбики — общий MonthlySourceBars (SVG без recharts, подписи текстом).
 */
function PainTrendBlock({
  trend,
  label,
  hasSourceTabs,
  sourceTab,
  scope,
  onScopeChange,
  niche,
  city,
}: {
  trend: PainTrendOut;
  label: string;
  hasSourceTabs: boolean;
  sourceTab: SourceTab;
  /** §B 2026-06-10: график — компания или вся ниша+город. */
  scope: 'company' | 'niche';
  onScopeChange: (next: 'company' | 'niche') => void;
  niche: string | null;
  city: string | null;
}) {
  // Когда trend пришёл из niche-endpoint, у него есть companies_affected.
  const companiesAffected = (trend as unknown as { companies_affected?: number })
    .companies_affected;
  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <DrawerSection
      title="Динамика жалобы"
      aside={
        niche ? (
          <Segmented<'company' | 'niche'>
            aria-label="Масштаб графика"
            size="sm"
            value={scope}
            onChange={onScopeChange}
            options={[
              { value: 'company', label: 'Компания', title: 'График по этой компании' },
              {
                value: 'niche',
                label: `Вся ниша${city ? ` · ${city}` : ''}`,
                title: `Общий график по нише${city ? ` · ${city}` : ''}`,
              },
            ]}
          />
        ) : undefined
      }
    >
      <p className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-small">
        <span className="font-semibold text-ui-text">{label}</span>
        <span className="tabular-nums text-ui-text-muted">
          {fmt(trend.first_review_at)} — {fmt(trend.last_review_at)} · {trend.total_reviews}{' '}
          {pluralRu(trend.total_reviews, ['отзыв', 'отзыва', 'отзывов'])}
          {scope === 'niche' && typeof companiesAffected === 'number' && companiesAffected > 0 && (
            <>
              {' '}
              · {companiesAffected}{' '}
              {pluralRu(companiesAffected, ['компания', 'компании', 'компаний'])}
            </>
          )}
          {/* График следует источнику, выбранному во вкладке «Отзывы». */}
          {hasSourceTabs &&
            (sourceTab === 'all' ? ' · все источники' : ` · ${sourceShortLabel(sourceTab)}`)}
        </span>
      </p>

      {trend.points.length === 0 ? (
        <p className="text-small text-ui-text-muted">
          У отзывов этой темы нет дат (источник их не отдаёт) — график построить нельзя.
        </p>
      ) : (
        <MonthlySourceBars
          points={trend.points}
          ariaLabel={`Динамика жалоб «${label}» по месяцам`}
          maxLabels={6}
        />
      )}
    </DrawerSection>
  );
}
