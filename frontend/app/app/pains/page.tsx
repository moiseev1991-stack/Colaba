'use client';

/**
 * /app/pains — «Поиск по боли» (вид Premium, 16.09, прототип «По боли»).
 *
 * Слева «На что жалуются»: боли выбранной ниши строками с полосой и числом отзывов
 * (можно выбрать несколько — компании с любой из них), без ниши — восемь общих категорий.
 * Внизу панели — поиск своей боли текстом по тегам ниши. Справа «Где искать»: город, ниша,
 * источник отзывов и «Показать компании». Ниже — сводка и карточки с оценкой «готовность»,
 * отзывами по кнопке и письмом под боль.
 *
 * Выбор тега идёт в /maps/companies/by-pain с pain_tag_ids (мимо match_pain_key),
 * категория — с pain_key.
 */

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Download, ListPlus, Send, Star } from 'lucide-react';

import { AddToListModal } from '@/components/maps/AddToListModal';
import { MapsCompanyDetailDrawer } from '@/components/maps/MapsCompanyDetailDrawer';
import { DraftEmailPopover, type CompanyForDraft } from '@/components/pains/DraftEmailPopover';
import { CityCombobox } from '@/components/CityCombobox';
import { NicheCombobox, type NicheOption } from '@/components/NicheCombobox';
import { SearchHero } from '@/components/search/SearchHero';
import { Button, buttonClass } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import {
  buildPainsExportUrl,
  getCompanyReviews,
  listCompaniesByPain,
  listInsightsNiches,
  listPainTags,
  nicheSuggestions,
  PAIN_KEY_LABELS,
  type CompaniesByPainListOut,
  type CompanyByPainOut,
  type PainKey,
  type PainTagOut,
  type ReviewOut,
} from '@/src/services/api/maps';

const PAIN_KEYS: PainKey[] = [
  'call_no_answer',
  'callback_lost',
  'schedule_hard',
  'schedule_wait',
  'queue_wait',
  'admin_rude',
  'unclear_pricing',
  'food_slow',
];

const PAGE_SIZE = 50;
const TAGS_SHOWN = 8;
const REVIEWS_PAGE = 5;

type ReviewSource = 'all' | 'yandex_maps' | '2gis' | 'google';

const REVIEW_SOURCES: { value: ReviewSource; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'yandex_maps', label: 'Яндекс.Карты' },
  { value: '2gis', label: '2GIS' },
  { value: 'google', label: 'Google' },
];

const SOURCE_SHORT: Record<string, string> = {
  yandex_maps: 'Я.Карты',
  '2gis': '2GIS',
  google: 'Google',
  google_maps: 'Google',
};

type ExpandedReviews = Record<
  number,
  { loading: boolean; reviews: ReviewOut[]; total: number; offset: number }
>;

export default function PainsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ui-text-muted">Загрузка…</div>}>
      <PainsPageInner />
    </Suspense>
  );
}

function PainsPageInner() {
  // /app/pains?niche=X&city=Y — заполняем фильтры (переход из /app/admin/data-inventory).
  const searchParams = useSearchParams();
  const initialNiche = searchParams?.get('niche') ?? '';
  const initialCity = searchParams?.get('city') ?? '';

  const [painKey, setPainKey] = useState<PainKey>('call_no_answer');
  // Несколько тегов — компании, у которых есть хотя бы один (ИЛИ). Пусто — ищем по категории painKey.
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [city, setCity] = useState<string>(initialCity);
  const [niche, setNiche] = useState<string>(initialNiche);
  const [niches, setNiches] = useState<NicheOption[]>([]);
  const [nichesLoading, setNichesLoading] = useState(true);

  const [data, setData] = useState<CompaniesByPainListOut | null>(null);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topTags, setTopTags] = useState<PainTagOut[]>([]);
  const [topTagsLoading, setTopTagsLoading] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [ownPain, setOwnPain] = useState('');

  const [addToListOpen, setAddToListOpen] = useState(false);
  // «Написать» — для одной компании или для выбранных / всех на странице.
  const [draftCompanies, setDraftCompanies] = useState<CompanyForDraft[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [drawerCompanyId, setDrawerCompanyId] = useState<number | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<ExpandedReviews>({});
  // Источник отзывов, которые раскрываются в карточках.
  const [reviewSource, setReviewSource] = useState<ReviewSource>('all');
  // Длинные отзывы, развёрнутые целиком (в карточке обрезаем до 280 символов).
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set());

  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);
  // Прогресс пересборки AI-тегов: опрос /rebuild-pain-tags-status раз в 20 секунд до ready.
  const [rebuildProgress, setRebuildProgress] = useState<{
    percent: number;
    reviews_analyzed: number;
    reviews_total: number;
    active_tags: number;
    pain_scores: number;
    ready: boolean;
    hint: string;
  } | null>(null);
  const rebuildPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // Поиск запускаем через счётчик, а не прямым вызовом: эффект видит уже обновлённые
  // выбор, город и нишу. Раньше клик по боли искал по предыдущему выбору.
  const [searchRequest, setSearchRequest] = useState<{
    n: number;
    offset: number;
    scroll: boolean;
  }>({ n: 0, offset: 0, scroll: false });
  const requestSearch = (nextOffset = 0, scroll = false) =>
    setSearchRequest((r) => ({ n: r.n + 1, offset: nextOffset, scroll }));

  useEffect(() => {
    // Ниши из базы с числом компаний (крупные сверху); если список недоступен —
    // прежние пресеты, чтобы поле не осталось пустым.
    listInsightsNiches()
      .then((rows) => setNiches(rows))
      .catch(() =>
        nicheSuggestions('')
          .then((names) => setNiches(names.map((n) => ({ niche: n }))))
          .catch(() => setNiches([])),
      )
      .finally(() => setNichesLoading(false));
  }, []);

  const autoRunRef = useRef(false);

  // Боли ниши — при смене ниши или города. Без ниши глобальный список тегов бесполезен.
  useEffect(() => {
    if (!niche) {
      setTopTags([]);
      return;
    }
    let cancelled = false;
    setTopTagsLoading(true);
    listPainTags(niche, city || undefined)
      .then((tags) => {
        if (cancelled) return;
        setTopTags(tags);
        // Переход из data-inventory: сразу показываем компании с самой частой болью ниши,
        // а не пустую категорию по умолчанию.
        if (
          !autoRunRef.current &&
          (initialNiche || initialCity) &&
          tags.length > 0 &&
          selectedTagIds.size === 0
        ) {
          autoRunRef.current = true;
          setSelectedTagIds(new Set([tags[0].id]));
          requestSearch(0);
        }
      })
      .catch(() => {
        if (!cancelled) setTopTags([]);
      })
      .finally(() => {
        if (!cancelled) setTopTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [niche, city]);

  const pollRebuildStatus = async () => {
    if (!niche) return;
    try {
      const params = new URLSearchParams({ niche });
      if (city) params.set('city', city);
      const res = await fetch(`/api/v1/maps/admin/rebuild-pain-tags-status?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = await res.json();
      setRebuildProgress({
        percent: Number(body.percent) || 0,
        reviews_analyzed: Number(body.reviews_analyzed) || 0,
        reviews_total: Number(body.reviews_total) || 0,
        active_tags: Number(body.active_tags) || 0,
        pain_scores: Number(body.pain_scores) || 0,
        ready: Boolean(body.ready),
        hint: String(body.hint || ''),
      });
      if (body.ready && rebuildPollTimer.current) {
        clearInterval(rebuildPollTimer.current);
        rebuildPollTimer.current = null;
      }
    } catch {
      /* следующий опрос повторит */
    }
  };

  useEffect(() => {
    return () => {
      if (rebuildPollTimer.current) {
        clearInterval(rebuildPollTimer.current);
        rebuildPollTimer.current = null;
      }
    };
  }, [niche, city]);

  const rebuildNiche = async () => {
    if (!niche) return;
    setRebuildBusy(true);
    setRebuildMsg(null);
    setRebuildProgress(null);
    try {
      const params = new URLSearchParams({ niche, sentiment: 'negative' });
      if (city) params.set('city', city);
      const res = await fetch(
        `/api/v1/maps/admin/rebuild-pain-tags-for-niche?${params.toString()}`,
        { method: 'POST' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRebuildMsg(`Ошибка ${res.status}: ${body?.detail ?? 'попробуйте позже'}`);
        return;
      }
      if (body.queued) {
        setRebuildMsg(
          `AI размечает отзывы ${body.companies_queued_for_analyze} компаний — прогресс ниже.`,
        );
        await pollRebuildStatus();
        if (rebuildPollTimer.current) clearInterval(rebuildPollTimer.current);
        rebuildPollTimer.current = setInterval(() => void pollRebuildStatus(), 20_000);
      } else {
        setRebuildMsg(body.hint ?? 'В базе нет компаний этой ниши.');
      }
    } catch (e) {
      setRebuildMsg(e instanceof Error ? e.message : 'Не удалось');
    } finally {
      setRebuildBusy(false);
    }
  };

  const runSearch = async (nextOffset: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof listCompaniesByPain>[0] = {
        city: city || undefined,
        niche: niche || undefined,
        limit: PAGE_SIZE,
        offset: nextOffset,
      };
      if (selectedTagIds.size > 0) params.pain_tag_ids = Array.from(selectedTagIds);
      else params.pain_key = painKey;
      const result = await listCompaniesByPain(params);
      setData(result);
      setOffset(nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить компании');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchRequest.n === 0) return;
    void runSearch(searchRequest.offset);
    if (searchRequest.scroll)
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRequest]);

  // Раскрыть / свернуть отзывы в карточке; при первом раскрытии — загрузить.
  // Выбраны теги — отзывы с первым из них (бэк /reviews принимает один pain_tag_id), иначе все негативные.
  const toggleExpand = async (companyId: number, initialLoad = true) => {
    if (expandedCompanies[companyId] && initialLoad) {
      setExpandedCompanies((prev) => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
      return;
    }
    const currentOffset = initialLoad ? 0 : (expandedCompanies[companyId]?.offset ?? 0);
    setExpandedCompanies((prev) => ({
      ...prev,
      [companyId]: {
        loading: true,
        reviews: prev[companyId]?.reviews ?? [],
        total: prev[companyId]?.total ?? 0,
        offset: currentOffset,
      },
    }));
    try {
      const firstTagId = selectedTagIds.size > 0 ? Array.from(selectedTagIds)[0] : undefined;
      const res = await getCompanyReviews(
        companyId,
        {
          sentiment: 'negative' as const,
          source: reviewSource !== 'all' ? reviewSource : undefined,
          pain_tag_id: firstTagId,
        },
        REVIEWS_PAGE,
        currentOffset,
      );
      setExpandedCompanies((prev) => ({
        ...prev,
        [companyId]: {
          loading: false,
          reviews: initialLoad ? res.items : [...(prev[companyId]?.reviews ?? []), ...res.items],
          total: res.total,
          offset: currentOffset + res.items.length,
        },
      }));
    } catch {
      setExpandedCompanies((prev) => ({
        ...prev,
        [companyId]: {
          ...(prev[companyId] ?? { reviews: [], total: 0, offset: 0 }),
          loading: false,
        },
      }));
    }
  };

  const toggleTag = (tag: PainTagOut) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tag.id)) next.delete(tag.id);
      else next.add(tag.id);
      return next;
    });
    setOwnPain('');
    requestSearch(0);
  };

  const pickPainKey = (key: PainKey) => {
    setPainKey(key);
    setSelectedTagIds(new Set());
    requestSearch(0);
  };

  const selectedTags = useMemo(
    () => topTags.filter((t) => selectedTagIds.has(t.id)),
    [topTags, selectedTagIds],
  );
  const activePainLabel = useMemo(() => {
    if (selectedTags.length === 1) return selectedTags[0].label;
    if (selectedTags.length > 1) {
      const preview = selectedTags
        .slice(0, 2)
        .map((t) => t.label)
        .join(', ');
      return `${selectedTags.length} ${plural(selectedTags.length, 'боль', 'боли', 'болей')} (${preview}${selectedTags.length > 2 ? `, +${selectedTags.length - 2}` : ''})`;
    }
    return PAIN_KEY_LABELS[painKey];
  }, [selectedTags, painKey]);

  const ownMatches = useMemo(() => {
    const q = ownPain.trim().toLowerCase();
    if (q.length < 3) return [];
    return topTags.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 4);
  }, [ownPain, topTags]);

  const maxOccurrences = Math.max(1, ...topTags.map((t) => t.occurrences_count));
  const visibleTags = showAllTags ? topTags : topTags.slice(0, TAGS_SHOWN);
  const totalMentions = topTags.reduce((sum, t) => sum + t.occurrences_count, 0);
  const pageIds = data?.items.map((c) => c.id) ?? [];
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((cid) => selectedIds.has(cid));
  const actionCompanies = (data?.items ?? []).filter(
    (c) => selectedIds.size === 0 || selectedIds.has(c.id),
  );

  return (
    <PageContainer className="pb-16 pt-8 sm:pt-10">
      <div className="mx-auto w-full max-w-[1072px]">
        <SearchHero active="pains" hintTitle="Поиск по боли">
          <p>
            Выберите город, нишу и частую жалобу — покажем компании, где она встречается в реальных
            отзывах, <b className="font-semibold text-ui-text">с цитатой и контактом</b>.
          </p>
          <p>
            Ищем по уже собранной базе — результат сразу. Письмо можно начать с цитаты их же отзыва.
          </p>
        </SearchHero>

        {/* 18.09 (@user): одна компактная карточка — сверху «где искать» в строку, ниже жалобы,
            внизу зелёная кнопка. */}
        <div className="mx-auto mt-4 w-full max-w-[880px] overflow-hidden rounded-panel border border-black/[.06] bg-ui-surface shadow-floating">
          {/* === Где искать === */}
          <section aria-label="Где искать" className="px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
              <div className="min-w-0">
                <label htmlFor="pains-city" className={LABEL}>
                  Город
                </label>
                <div className="flex items-center gap-1.5">
                  <CityCombobox
                    id="pains-city"
                    city={city}
                    onCityChange={(c) => setCity(c)}
                    placeholder="Любой"
                    className="min-w-0 flex-1"
                  />
                  {city && (
                    <button
                      type="button"
                      onClick={() => setCity('')}
                      aria-label="Убрать город"
                      className="grid h-11 w-8 shrink-0 place-items-center rounded-control text-ui-text-muted hover:bg-ui-surface-2 hover:text-ui-text"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <label htmlFor="pains-niche" className={LABEL}>
                  Ниша
                </label>
                {/* 18.09 (@user): ниша — выпадающий список ниш из базы, как город. */}
                <div className="flex items-center gap-1.5">
                  <NicheCombobox
                    id="pains-niche"
                    niche={niche}
                    onNicheChange={setNiche}
                    options={niches}
                    loading={nichesLoading}
                    placeholder="Все ниши"
                    className="min-w-0 flex-1"
                  />
                  {niche && (
                    <button
                      type="button"
                      onClick={() => setNiche('')}
                      aria-label="Убрать нишу"
                      className="grid h-11 w-8 shrink-0 place-items-center rounded-control text-ui-text-muted hover:bg-ui-surface-2 hover:text-ui-text"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                <span className={LABEL}>Источник отзывов</span>
                <div
                  className="flex min-h-11 flex-wrap items-center gap-1"
                  role="group"
                  aria-label="Источник отзывов"
                >
                  {REVIEW_SOURCES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={reviewSource === opt.value}
                      onClick={() => {
                        setReviewSource(opt.value);
                        setExpandedCompanies({});
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                        reviewSource === opt.value
                          ? 'border-ui-text bg-ui-text text-ui-surface'
                          : 'border-ui-border text-ui-text-muted hover:text-ui-text',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* === На что жалуются === */}
          <section
            aria-labelledby="pains-what"
            className="border-t border-black/[.06] px-5 pb-4 pt-4 sm:px-7"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h2 id="pains-what" className="text-base font-bold text-ui-text">
                На что жалуются
              </h2>
              <p className="text-xs text-ui-text-muted">
                {niche
                  ? `${capitalize(niche)}${city ? ` · ${city}` : ''}${totalMentions > 0 ? ` · ${totalMentions.toLocaleString('ru-RU')} упоминаний в отзывах` : ''}`
                  : 'Частые жалобы по всем нишам — выберите нишу, чтобы увидеть её боли'}
              </p>
            </div>
            <div className="-mx-3 mt-2 grid gap-x-2 sm:grid-cols-2">
              {niche && topTagsLoading && topTags.length === 0 && (
                <p className="px-3 py-4 text-small text-ui-text-muted sm:col-span-2">
                  Загрузка болей ниши…
                </p>
              )}
              {niche && !topTagsLoading && topTags.length === 0 && (
                <p className="px-3 py-4 text-small text-ui-text-muted sm:col-span-2">
                  Для этой ниши боли ещё не размечены. Выберите категорию ниже — или пересоберите
                  AI-теги в результатах.
                </p>
              )}
              {niche && topTags.length > 0
                ? visibleTags.map((t) => (
                    <PainRow
                      key={t.id}
                      label={t.label}
                      title={t.description ?? undefined}
                      count={t.occurrences_count}
                      share={t.occurrences_count / maxOccurrences}
                      active={selectedTagIds.has(t.id)}
                      onClick={() => toggleTag(t)}
                    />
                  ))
                : PAIN_KEYS.map((k) => (
                    <PainRow
                      key={k}
                      label={PAIN_KEY_LABELS[k]}
                      active={selectedTagIds.size === 0 && painKey === k && data !== null}
                      onClick={() => pickPainKey(k)}
                    />
                  ))}
            </div>
            {niche && topTags.length > TAGS_SHOWN && (
              <button
                type="button"
                onClick={() => setShowAllTags((v) => !v)}
                className="mt-1 text-small font-semibold text-ui-accent hover:underline"
              >
                {showAllTags
                  ? 'Скрыть'
                  : `Показать ещё ${topTags.length - TAGS_SHOWN} ${plural(topTags.length - TAGS_SHOWN, 'боль', 'боли', 'болей')}`}
              </button>
            )}
            <div className="mt-3">
              <label htmlFor="pains-own" className="sr-only">
                Своя жалоба
              </label>
              <Input
                id="pains-own"
                value={ownPain}
                onChange={(e) => setOwnPain(e.target.value)}
                disabled={!niche}
                placeholder={
                  niche
                    ? 'Или впишите своё — например: «не перезвонили»'
                    : 'Своя жалоба — сначала выберите нишу'
                }
                className="h-10"
              />
              {ownPain.trim().length >= 3 && (
                <div className="mt-2.5 text-small text-ui-text-muted">
                  {ownMatches.length === 0 ? (
                    'Подходящих тегов в этой нише нет — попробуйте другое слово.'
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Найдено:</span>
                      {ownMatches.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag(t)}
                          className="rounded-full bg-ui-surface px-3 py-1 text-small font-semibold text-ui-accent shadow-raised hover:bg-ui-accent/[.06]"
                        >
                          «{t.label}» · {t.occurrences_count}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <div className="border-t border-black/[.06] bg-ui-surface-2/60 px-5 py-4 sm:px-7">
            <Button
              onClick={() => requestSearch(0, true)}
              loading={isLoading}
              iconRight={!isLoading ? <ArrowRight /> : undefined}
              className="h-12 w-full text-base"
            >
              Показать компании
            </Button>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-control bg-ui-danger/10 px-3 py-2 text-small text-ui-danger"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        {/* === Результаты === */}
        <section
          ref={resultsRef}
          aria-label="Компании"
          className="mx-auto mt-10 w-full max-w-[880px] scroll-mt-20"
        >
          {data && data.items.length === 0 && !isLoading && (
            <div className="rounded-panel bg-ui-surface-2 p-6 text-small text-ui-text-muted">
              <p className="text-base font-bold text-ui-text">
                Компаний с болью «{activePainLabel}» не нашлось
              </p>
              {city || niche ? (
                <>
                  <p className="mt-1.5">
                    {data.pain_labels.length > 0
                      ? `Похожие теги в базе есть (${data.pain_labels
                          .slice(0, 3)
                          .map((l) => `«${l}»`)
                          .join(
                            ', ',
                          )}${data.pain_labels.length > 3 ? '…' : ''}), но у компаний с этим фильтром их нет. Попробуйте снять фильтр:`
                      : 'Для этого города и ниши боль ещё не размечена. Снимите фильтр или пересоберите AI-теги:'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {city && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-ui-surface"
                        onClick={() => {
                          setCity('');
                          requestSearch(0);
                        }}
                      >
                        Убрать город «{city}»
                      </Button>
                    )}
                    {niche && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-ui-surface"
                        onClick={() => {
                          setNiche('');
                          requestSearch(0);
                        }}
                      >
                        Убрать нишу «{niche}»
                      </Button>
                    )}
                    {niche && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-ui-surface"
                        onClick={rebuildNiche}
                        disabled={rebuildBusy}
                      >
                        {rebuildBusy ? 'Ставлю в очередь…' : 'Пересобрать AI-теги ниши'}
                      </Button>
                    )}
                  </div>
                  {rebuildMsg && <p className="mt-2 text-xs">{rebuildMsg}</p>}
                  {rebuildProgress && (
                    <div className="mt-3 rounded-card bg-ui-surface p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ui-text">AI-разметка отзывов</span>
                        <span className="tabular-nums">
                          {rebuildProgress.reviews_analyzed.toLocaleString('ru-RU')} /{' '}
                          {rebuildProgress.reviews_total.toLocaleString('ru-RU')} ·{' '}
                          <b>{rebuildProgress.percent}%</b>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ui-border">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            rebuildProgress.ready ? 'bg-ui-success' : 'bg-ui-accent',
                          )}
                          style={{
                            width: `${Math.max(2, Math.min(100, rebuildProgress.percent))}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs">
                        Тегов: {rebuildProgress.active_tags} · связей компания↔боль:{' '}
                        {rebuildProgress.pain_scores}
                        {rebuildProgress.ready
                          ? ' · готово — выберите нишу заново'
                          : ' · обновляется каждые 20 секунд'}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-1.5">
                  {data.pain_labels.length > 0
                    ? `Теги есть (${data.pain_labels.length}), но ни одна компания с ними не связана — напишите в поддержку.`
                    : 'AI ещё не выделил эту тему в отзывах. Запустите новый поиск по картам или подождите 5–10 минут.'}
                </p>
              )}
            </div>
          )}

          {data && data.items.length > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-panel bg-ui-surface-2 p-5 sm:p-6">
                <div className="min-w-0">
                  <div className="text-[44px] font-bold leading-none tabular-nums text-ui-accent">
                    {data.total.toLocaleString('ru-RU')}
                  </div>
                  <p className="mt-1.5 text-small text-ui-text-muted">
                    {plural(data.total, 'компания', 'компании', 'компаний')} с жалобами на{' '}
                    <b className="font-bold text-ui-text">«{activePainLabel}»</b>
                  </p>
                  {selectedTagIds.size === 0 && data.pain_labels.length > 0 && (
                    <p
                      className="mt-0.5 text-xs text-ui-text-muted"
                      title={data.pain_labels.join(', ')}
                    >
                      по тегам: {data.pain_labels.slice(0, 3).join(', ')}
                      {data.pain_labels.length > 3 && ` +${data.pain_labels.length - 3}`}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 pr-1 text-small font-semibold text-ui-text-muted">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={(e) => {
                        if (e.target.checked)
                          setSelectedIds((prev) => new Set([...prev, ...pageIds]));
                        else
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            pageIds.forEach((cid) => next.delete(cid));
                            return next;
                          });
                      }}
                      className="h-4 w-4 cursor-pointer accent-[hsl(var(--color-accent))]"
                    />
                    Выбрать всех{selectedIds.size > 0 && ` · ${selectedIds.size}`}
                  </label>
                  <a
                    href={buildPainsExportUrl({
                      pain_key: selectedTagIds.size > 0 ? undefined : painKey,
                      pain_tag_ids:
                        selectedTagIds.size > 0 ? Array.from(selectedTagIds) : undefined,
                      city: city || undefined,
                      niche: niche || undefined,
                      company_ids: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
                    })}
                    title="Скачать .xlsx: выбранные компании или все по текущей боли"
                    className={cn(
                      buttonClass({ variant: 'secondary', size: 'sm' }),
                      'h-10 bg-ui-surface shadow-raised hover:bg-ui-surface',
                    )}
                  >
                    <Download className="h-4 w-4" aria-hidden /> Excel
                  </a>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10 bg-ui-surface shadow-raised hover:bg-ui-surface"
                    iconLeft={<Send />}
                    onClick={() => {
                      setDraftCompanies(actionCompanies as CompanyForDraft[]);
                      setDraftOpen(true);
                    }}
                    title="Шаблон письма с подставленной болью — скопировать или открыть в почте"
                  >
                    Написать
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10 bg-ui-surface shadow-raised hover:bg-ui-surface"
                    iconLeft={<ListPlus />}
                    onClick={() => setAddToListOpen(true)}
                  >
                    В список
                  </Button>
                </div>
              </div>

              <ul className="mt-5 flex flex-col gap-3.5">
                {data.items.map((c) => (
                  <PainCompanyCard
                    key={c.id}
                    company={c}
                    painLabel={
                      selectedTags.length === 1
                        ? selectedTags[0].label
                        : selectedTags.length > 1
                          ? null
                          : PAIN_KEY_LABELS[painKey]
                    }
                    selected={selectedIds.has(c.id)}
                    onToggleSelect={() =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                    onOpen={() => setDrawerCompanyId(c.id)}
                    onWrite={() => {
                      setDraftCompanies([c as CompanyForDraft]);
                      setDraftOpen(true);
                    }}
                    reviews={expandedCompanies[c.id]}
                    onToggleReviews={() => void toggleExpand(c.id, true)}
                    onMoreReviews={() => void toggleExpand(c.id, false)}
                    expandedReviewIds={expandedReviews}
                    onToggleReviewText={(rid) =>
                      setExpandedReviews((prev) => {
                        const next = new Set(prev);
                        if (next.has(rid)) next.delete(rid);
                        else next.add(rid);
                        return next;
                      })
                    }
                  />
                ))}
              </ul>

              {(data.total > offset + data.items.length || offset > 0) && (
                <nav
                  aria-label="Страницы"
                  className="flex items-center justify-center gap-4 pt-6 text-small text-ui-text-muted"
                >
                  <Button
                    variant="secondary"
                    disabled={offset === 0 || isLoading}
                    onClick={() => requestSearch(Math.max(0, offset - PAGE_SIZE), true)}
                  >
                    ← Назад
                  </Button>
                  <span>
                    <b className="font-semibold tabular-nums text-ui-text">
                      {offset + 1}–{offset + data.items.length}
                    </b>{' '}
                    из <b className="font-semibold tabular-nums text-ui-text">{data.total}</b>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={offset + data.items.length >= data.total || isLoading}
                    onClick={() => requestSearch(offset + PAGE_SIZE, true)}
                  >
                    Дальше →
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>

        <AddToListModal
          open={addToListOpen}
          companyIds={selectedIds.size > 0 ? Array.from(selectedIds) : pageIds}
          defaultListName={
            data
              ? `Боль «${activePainLabel}»${niche ? ` — ${niche}` : ''}${city ? ` / ${city}` : ''}`
              : undefined
          }
          onClose={() => setAddToListOpen(false)}
          onDone={() => {
            setAddToListOpen(false);
            setSelectedIds(new Set());
          }}
        />

        {/* Карточка компании — без контекста поиска: «Найти ЛПР» и повтор источника не показываются. */}
        <MapsCompanyDetailDrawer
          companyId={drawerCompanyId}
          searchId={null}
          onClose={() => setDrawerCompanyId(null)}
        />

        <DraftEmailPopover
          open={draftOpen}
          companies={draftCompanies}
          painLabel={activePainLabel}
          painKey={selectedTagIds.size > 0 ? null : painKey}
          onClose={() => setDraftOpen(false)}
        />
      </div>
    </PageContainer>
  );
}

const LABEL = 'mb-1.5 block text-xs font-semibold text-ui-text-muted';

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Строка боли: отметка, название, полоса доли и число отзывов. */
function PainRow({
  label,
  title,
  count,
  share,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  count?: number;
  share?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={cn(
        'grid min-h-12 w-full grid-cols-[1fr_auto] items-center gap-4 rounded-card px-3 py-2.5 text-left transition-colors',
        active ? 'bg-ui-accent/[.08]' : 'hover:bg-ui-surface-2',
      )}
    >
      <span className="min-w-0">
        <span className={cn('flex items-center gap-2.5', share != null && 'mb-1.5')}>
          <span
            aria-hidden
            className={cn(
              'grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
              active
                ? 'border-ui-accent bg-ui-accent text-ui-accent-contrast'
                : 'border-ui-border text-transparent',
            )}
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
          </span>
          <span
            className={cn(
              'truncate text-small',
              active ? 'font-bold text-ui-accent' : 'font-semibold text-ui-text',
            )}
          >
            {label}
          </span>
        </span>
        {share != null && (
          <span className="block h-1.5 overflow-hidden rounded-full bg-ui-surface-2">
            <span
              className={cn(
                'block h-full rounded-full',
                active ? 'bg-ui-accent' : 'bg-ui-text-muted/40',
              )}
              style={{ width: `${Math.max(4, Math.round(share * 100))}%` }}
            />
          </span>
        )}
      </span>
      {count != null && (
        <span className="text-right text-small font-semibold tabular-nums text-ui-text">
          {count.toLocaleString('ru-RU')}
          <span className="block text-xs font-medium text-ui-text-muted">
            {plural(count, 'отзыв', 'отзыва', 'отзывов')}
          </span>
        </span>
      )}
    </button>
  );
}

/** Карточка компании в «По боли»: суть слева, справа готовность, телефон и действия. */
function PainCompanyCard({
  company: c,
  painLabel,
  selected,
  onToggleSelect,
  onOpen,
  onWrite,
  reviews,
  onToggleReviews,
  onMoreReviews,
  expandedReviewIds,
  onToggleReviewText,
}: {
  company: CompanyByPainOut;
  painLabel: string | null;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onWrite: () => void;
  reviews?: ExpandedReviews[number];
  onToggleReviews: () => void;
  onMoreReviews: () => void;
  expandedReviewIds: Set<number>;
  onToggleReviewText: (reviewId: number) => void;
}) {
  const temp = c.lead_temperature;
  const tone = temp == null ? 'cool' : temp >= 70 ? 'hot' : temp >= 40 ? 'warm' : 'cool';
  const reviewsCount = c.reviews_negative_count || c.reviews_count;
  const meta = [
    c.address,
    c.rating != null ? `★ ${c.rating.toFixed(1)}` : null,
    c.reviews_count
      ? `${c.reviews_count} ${plural(c.reviews_count, 'отзыв', 'отзыва', 'отзывов')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      onClick={(e) => {
        // Клик по чекбоксу, ссылке или кнопке не открывает карточку.
        if ((e.target as HTMLElement).closest('a, button, input, label')) return;
        onOpen();
      }}
      className={cn(
        'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-panel border bg-ui-surface p-4 shadow-raised transition-all hover:-translate-y-0.5 hover:shadow-floating sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-5',
        selected ? 'border-ui-accent/30 bg-ui-accent/[.02]' : 'border-black/[.05]',
      )}
    >
      <div className="row-span-2 flex gap-3 lg:row-span-1">
        <span
          aria-hidden
          className={cn(
            'w-[5px] shrink-0 rounded-full',
            selected
              ? 'bg-ui-accent'
              : tone === 'hot'
                ? 'bg-red-300'
                : tone === 'warm'
                  ? 'bg-amber-300'
                  : 'bg-ui-border',
          )}
        />
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Выбрать: ${c.name}`}
          className="mt-1 h-[18px] w-[18px] cursor-pointer accent-[hsl(var(--color-accent))]"
        />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h3 className="text-base font-bold leading-snug tracking-tight text-ui-text">{c.name}</h3>
          {meta && <span className="text-small text-ui-text-muted">{meta}</span>}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ui-accent/[.08] px-3 py-0.5 text-xs font-semibold text-ui-accent">
            {painLabel ?? 'упоминаний боли'}
            <span className="font-medium tabular-nums text-ui-text-muted">
              ×{c.pain_mention_count}
            </span>
          </span>
        </div>
        {c.top_quote && !reviews && (
          <p className="mt-2.5 max-w-[62ch] text-small leading-relaxed text-ui-text-muted">
            «{c.top_quote}»
          </p>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold">
          {c.reviews_negative_count > 0 && (
            <span className="text-ui-danger">
              {c.reviews_negative_count}{' '}
              {plural(c.reviews_negative_count, 'негативный', 'негативных', 'негативных')}
            </span>
          )}
          {c.website ? (
            <a
              href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-ui-text-muted hover:text-ui-accent"
            >
              {c.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          ) : (
            <span className="text-ui-warning">сайта нет</span>
          )}
          {c.niche && <span className="font-medium text-ui-text-muted">{c.niche}</span>}
          {c.city && <span className="font-medium text-ui-text-muted">{c.city}</span>}
        </p>

        {reviews && (
          <div className="mt-3 flex flex-col gap-2 rounded-card bg-ui-surface-2 p-2.5">
            {reviews.loading && reviews.reviews.length === 0 && (
              <p className="px-1 text-xs text-ui-text-muted">Загрузка отзывов…</p>
            )}
            {!reviews.loading && reviews.reviews.length === 0 && (
              <p className="px-1 text-xs text-ui-text-muted">
                Отзывов с этой болью в выбранном источнике нет.
              </p>
            )}
            {reviews.reviews.map((r) => {
              const text = r.raw_text ?? '';
              const isLong = text.length > 280;
              const full = expandedReviewIds.has(r.id);
              return (
                <div key={r.id} className="rounded-control bg-ui-surface p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-ui-text-muted">
                    {r.rating != null && (
                      <span className="inline-flex items-center gap-1 font-semibold text-ui-danger">
                        <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                        {r.rating}/5
                      </span>
                    )}
                    {r.source && <span>{SOURCE_SHORT[r.source] ?? r.source}</span>}
                    {r.posted_at && (
                      <span>
                        {new Date(r.posted_at).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                    {r.has_owner_reply && <span className="text-ui-success">владелец ответил</span>}
                    {r.source_url && (
                      <a
                        href={r.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto hover:text-ui-accent"
                      >
                        открыть ↗
                      </a>
                    )}
                  </div>
                  {text && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-small text-ui-text">
                      «{isLong && !full ? `${text.slice(0, 280)}…` : text}»
                    </p>
                  )}
                  {isLong && (
                    <button
                      type="button"
                      onClick={() => onToggleReviewText(r.id)}
                      className="mt-1 text-xs font-semibold text-ui-accent hover:underline"
                    >
                      {full ? 'Свернуть' : 'Читать полностью'}
                    </button>
                  )}
                </div>
              );
            })}
            {reviews.total > reviews.reviews.length && (
              <Button
                size="sm"
                variant="secondary"
                className="bg-ui-surface"
                onClick={onMoreReviews}
                disabled={reviews.loading}
              >
                {reviews.loading
                  ? 'Загрузка…'
                  : `Показать ещё · ${reviews.total - reviews.reviews.length}`}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:col-start-3 lg:w-[210px] lg:flex-col lg:items-end lg:justify-center lg:gap-1.5 lg:text-right">
        {temp != null && (
          <span
            className="flex items-baseline gap-2 lg:flex-col lg:items-end lg:gap-0"
            title="Готовность 0–100: рейтинг, свежесть и число отзывов, контакты, ответы владельца"
          >
            <span
              className={cn(
                'text-xl font-bold tabular-nums',
                tone === 'hot'
                  ? 'text-ui-danger'
                  : tone === 'warm'
                    ? 'text-ui-warning'
                    : 'text-ui-text-muted',
              )}
            >
              {temp}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-ui-text-muted">
              готовность
            </span>
          </span>
        )}
        {c.phone && (
          <a
            href={`tel:${c.phone}`}
            className="whitespace-nowrap text-small font-semibold tabular-nums text-ui-text hover:text-ui-accent"
          >
            {c.phone}
          </a>
        )}
        <div className="flex flex-wrap gap-1.5 lg:mt-1.5 lg:justify-end">
          <button
            type="button"
            onClick={onWrite}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ui-text px-3.5 text-small font-semibold text-ui-surface transition-colors hover:bg-black"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            Написать под боль
          </button>
          <button
            type="button"
            onClick={onToggleReviews}
            aria-expanded={!!reviews}
            className="inline-flex min-h-9 items-center rounded-full bg-ui-surface-2 px-3.5 text-small font-semibold text-ui-text-muted transition-colors hover:bg-ui-border hover:text-ui-text"
          >
            {reviews ? 'Скрыть отзывы' : `Отзывы${reviewsCount ? ` · ${reviewsCount}` : ''}`}
          </button>
        </div>
      </div>
    </li>
  );
}
