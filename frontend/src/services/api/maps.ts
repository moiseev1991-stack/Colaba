/**
 * Maps API client.
 *
 * Шаги 13-16 ТЗ: фронтенд использует это API в новой вкладке «По картам»
 * на /app/leads.
 */

import { apiClient } from '@/client';

// ---------------------------------------------------------------------------
// Types (соответствуют Pydantic-схемам backend/app/modules/maps/schemas.py)
// ---------------------------------------------------------------------------

export type MapSource = '2gis' | 'yandex_maps' | 'google_maps';

export type SortBy =
  | 'rating_asc'
  | 'rating_desc'
  | 'reviews_desc'
  | 'negative_desc'
  | 'pain_desc'
  | 'temperature_desc'
  | 'website_score_desc'
  // UI-only сортировки. Бэк про них не знает (sort_by там Literal-enum),
  // поэтому в запросах подменяем на rating_desc и сортируем результат на
  // клиенте по aiAnalyses[company_id].score.
  | 'ai_score_desc'
  | 'ai_score_asc';

/** Сортировки, которые бэк не поддерживает — их фронт обрабатывает локально. */
export function isClientOnlySort(s: SortBy | undefined | null): boolean {
  return s === 'ai_score_desc' || s === 'ai_score_asc';
}

/** Блок 5 ТЗ 2026-06-02 + §2 ТЗ 2026-06-10: переключаемые слои тепловой карты.
 *  pain_type — слой по конкретному pain_tag_id (требует доп. query-param). */
export type HeatmapLayer =
  | 'density'
  | 'pain'
  | 'website'
  | 'rating'
  | 'wealth'
  | 'pain_type';

export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

export interface HeatmapOut {
  layer: HeatmapLayer;
  points: HeatmapPoint[];
  /** Шкала Leaflet.heat (передаётся в `max` опцию плагина). */
  max_intensity: number;
  total_companies: number;
  contributing: number;
}

export async function getSearchHeatmap(
  searchId: number,
  layer: HeatmapLayer,
  source_filter?: 'all' | '2gis' | 'yandex_maps' | 'google_maps' | null,
  painTagId?: number | null,
): Promise<HeatmapOut> {
  const params = new URLSearchParams({ layer });
  if (source_filter && source_filter !== 'all') {
    params.set('source_filter', source_filter);
  }
  if (layer === 'pain_type' && painTagId != null) {
    params.set('pain_tag_id', String(painTagId));
  }
  const resp = await apiClient.get<HeatmapOut>(
    `/maps/search/${searchId}/heatmap?${params.toString()}`,
  );
  return resp.data;
}

/** Нормализует sort_by для запроса к бэку: client-only превращаются в rating_desc. */
function backendSortBy(s: SortBy | undefined | null): SortBy {
  if (isClientOnlySort(s)) return 'rating_desc';
  return s ?? 'rating_desc';
}

export interface MapSearchFilter {
  min_rating?: number | null;
  max_rating?: number | null;
  min_reviews?: number | null;
  min_negative?: number | null;
  has_owner_replies?: boolean | null;
  /** true — только компании с сайтом, false — только без сайта, null — не важно. */
  has_website?: boolean | null;
  /** 2026-06-12: true — компании с известным ЛПР (DaData director_name
   *  или decision_makers со страниц сайта), false — без, null — не важно. */
  has_lpr?: boolean | null;
  pain_tag_ids?: number[] | null;
  min_pain_mentions?: number;
  sort_by?: SortBy;
  /** Подстрока — компания пройдёт фильтр, если у неё есть хотя бы один отзыв,
   *  содержащий эту подстроку (ILIKE на сервере). */
  review_text_contains?: string | null;
  /** Обратное условие — компания пройдёт фильтр, если у неё НЕТ ни одного
   *  отзыва, содержащего эту подстроку. */
  review_text_excludes?: string | null;
  /** Массив-форма: ИЛИ — компания пройдёт фильтр, если у неё есть отзыв с
   *  ЛЮБЫМ из слов. Объединяется с single-формой. */
  review_text_contains_any?: string[] | null;
  /** Массив-форма: компания не пройдёт, если у неё есть отзыв хотя бы с
   *  ОДНИМ из слов. */
  review_text_excludes_any?: string[] | null;
  /** Блок 2 ТЗ 2026-06-02: «Платёжеспособные». Оборот в рублях из
   *  company_legal (DaData). Включает JOIN company_legal status='ok'. */
  min_revenue?: number | null;
  /** Возраст компании в полных годах от registration_date. */
  min_age_years?: number | null;
  /** Multi-source (ТЗ 2026-06-04, расш. 2026-06-16): сегмент-переключатель в шапке выдачи.
   *  'all' / null — все источники. '2gis'/'yandex_maps'/'google_maps' — EXISTS-фильтр
   *  по company_sources. Склеенные мультисурс-компании остаются в обоих. */
  source_filter?: 'all' | '2gis' | 'yandex_maps' | 'google_maps' | null;
}

export type SearchMode = 'city' | 'radius';

export interface MapSearchCreate {
  niche: string;
  city: string;
  sources?: MapSource[];
  filters?: MapSearchFilter | null;
  mode?: SearchMode;
  address?: string | null;
  radius_meters?: number | null;
}

export interface MapSearchOut {
  id: number;
  niche: string;
  city: string;
  sources: string;
  status: string;
  ai_progress: string;
  companies_found: number;
  reviews_found: number;
  error?: string | null;
  error_type?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  /** Сохранённые при создании фильтры — нужны чтобы применить
   *  выбранный на форме поиска пресет к первой загрузке выдачи. */
  filters?: MapSearchFilter | null;
  mode?: string;
  address?: string | null;
  point_lat?: number | null;
  point_lng?: number | null;
  radius_meters?: number | null;
}

export interface PainTagShort {
  id: number;
  label: string;
  similarity?: number | null;
}

export interface PainTagOut {
  id: number;
  niche: string;
  city?: string | null;
  label: string;
  description?: string | null;
  occurrences_count: number;
  cluster_size?: number | null;
  examples?: Array<{ text_hash?: string | null; text_preview?: string }>;
  status: string;
}

export interface CompanyPainOut {
  pain_tag_id: number;
  label: string;
  description?: string | null;
  mention_count: number;
  top_quote?: string | null;
  top_quote_similarity?: number | null;
}

/** Multi-source (Phase 4 ТЗ 2026-06-03): один контакт с пометкой источника.
 *  Дедуп между источниками НЕ делается — если телефон совпал в 2GIS и Я.Картах,
 *  это две записи (UI может пометить «совпадает»). */
export interface CompanyContactOut {
  source: string;        // '2gis' | 'yandex_maps'
  type: string;          // 'phone' | 'email' | 'website' | 'telegram' | 'whatsapp' | 'vk' | ...
  value: string;
  is_primary: boolean;
}

/** Multi-source: один источниковый профиль компании. У одноисточниковых длина 1,
 *  у склеенных Phase 2/3 — 2 (2gis + yandex_maps). */
export interface CompanySourceOut {
  source: string;
  external_id: string;
  source_url?: string | null;
  rating?: number | null;
  reviews_count: number;
  reviews_positive_count: number;
  reviews_negative_count: number;
  reviews_neutral_count: number;
  has_owner_replies: boolean;
  owner_replies_count: number;
  contacts: CompanyContactOut[];
}

export interface CompanyOut {
  id: number;
  name: string;
  niche?: string | null;
  city?: string | null;
  address?: string | null;
  /** Координаты для UI-карты (см. MapsCompaniesMap). Старые компании
   *  могут не иметь координат — на карте просто не показываются. */
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews_count: number;
  reviews_positive_count: number;
  reviews_negative_count: number;
  reviews_neutral_count: number;
  has_owner_replies: boolean;
  owner_replies_count: number;
  last_review_at?: string | null;
  source: string;
  /** ID компании во внешнем источнике (2GIS / Я.Карты). Используется для
   *  deeplink в drawer-карточке: «открыть в 2GIS». */
  external_id?: string | null;
  pain_tags: PainTagShort[];
  emails?: string[] | null;
  contacts_extra?: Record<string, unknown> | null;
  top_pains?: CompanyPainOut[];
  /** Fallback-цитаты негативных отзывов когда top_pains пуст (AI ещё не
   *  разобрал). 1-2 короткие фразы из отзывов с rating<=3 / sentiment=negative. */
  negative_snippets?: string[];
  /** Lead temperature (0..100). null = пересчёт ещё не прогонялся. */
  lead_temperature?: number | null;
  /** Website lead score (0..100). null = у компании есть свой сайт
   *  (она не website-лид). */
  website_lead_score?: number | null;
  /** Юр.данные из DaData (блок 2). null если не обогащались или
   *  matched_by=null. */
  legal?: CompanyLegalShort | null;
  /** Multi-source профили (Phase 4 ТЗ 2026-06-03). У одноисточниковых компаний
   *  массив длины 1, у склеенных 2gis+yandex_maps — длины 2. Контакты внутри
   *  каждого профиля показываем в drawer раздельно в секциях. */
  sources_profiles?: CompanySourceOut[];
  /** ЛПР со страниц сайта (ТЗ A.2 2026-06-04). Подтягивается Celery-таском
   *  enrich_company_team. Пустой массив = краулер ещё не отработал или сайт
   *  без явных страниц команды. */
  decision_makers?: DecisionMakerOut[];
  /** 2026-06-12: true если у компании известен ЛПР (DaData director_name или
   *  хотя бы один decision_maker). Pill в карточке выдачи + фильтр в сайдбаре. */
  has_lpr?: boolean;
}

/** ЛПР, извлечённый LLM-ом со страницы сайта /команда /о-нас /контакты
 *  (ТЗ A.2 2026-06-04). source указывает с какой страницы пришло.
 *  is_decision_maker=true для ролей в whitelist (директор/владелец/...).
 *  Параллельно с CompanyLegalShort.director_name (DaData по ЕГРЮЛ). */
export interface DecisionMakerOut {
  name: string;
  post?: string | null;
  source: string;
  source_url?: string | null;
  confidence?: number | null;
  is_decision_maker: boolean;
}

export interface CompanyLegalShort {
  inn?: string | null;
  ogrn?: string | null;
  legal_name?: string | null;
  legal_short_name?: string | null;
  registration_date?: string | null;
  revenue?: number | null;
  employee_count?: number | null;
  legal_status?: string | null;
  okved?: string | null;
  okved_name?: string | null;
  /** ЛПР (ТЗ A.1 2026-06-04): ФИО руководителя и должность из DaData.
   *  Отображается в drawer карточки как «ЛПР: Иванов Иван, директор».
   *  В outreach-письме первое имя подставляется в обращение. */
  director_name?: string | null;
  director_post?: string | null;
  age_years?: number | null;
  match_confidence?: number | null;
  matched_by?: string | null;
}

export interface OutreachDraftOut {
  company_id: number;
  company_name: string;
  subject: string;
  body: string;
  used_pains: CompanyPainOut[];
  suggested_to_emails: string[];
}

export type OutreachAngle = 'website' | 'reputation' | 'automation' | 'seo' | 'auto';
export type OutreachTone = 'friendly' | 'official';
export type OutreachLanguage = 'ru' | 'en';

export interface OutreachDraftRequest {
  angle?: OutreachAngle;
  tone?: OutreachTone;
  language?: OutreachLanguage;
  regenerate?: boolean;
}

export interface OutreachDraftCachedOut {
  company_id: number;
  company_name: string;
  subject: string;
  body: string;
  /** Конкретный угол, который сервер использовал (auto уже резолвнут). */
  angle_used: string;
  tone: string;
  language: string;
  pains_used: CompanyPainOut[];
  suggested_to_emails: string[];
  /** true — ответ отдан из кэша, без вызова LLM. */
  cached: boolean;
}

export interface ReviewOut {
  id: number;
  author_masked?: string | null;
  rating?: number | null;
  raw_text?: string | null;
  sentiment?: string | null;
  sentiment_score?: number | null;
  posted_at?: string | null;
  has_owner_reply: boolean;
  source_url?: string | null;
  pain_tags: PainTagShort[];
  /** Multi-source (Phase 4): '2gis' | 'yandex_maps' | 'google'. Используется
   *  для вкладок «Все / 2GIS / Я.Карты» в drawer. */
  source?: string | null;
}

export interface CompanyDetailOut extends CompanyOut {
  recent_reviews: ReviewOut[];
}

/** Multi-source (ТЗ 2026-06-04): счётчики компаний по источникам. */
export interface SourceCountsOut {
  total: number;
  twogis: number;
  yandex_maps: number;
  both: number;
}

export interface CompaniesListOut {
  items: CompanyOut[];
  total: number;
  limit: number;
  offset: number;
  /** Multi-source: для сегмент-переключателя «Все · 2GIS · Я.Карты». */
  source_counts?: SourceCountsOut | null;
}

export interface ReviewsListOut {
  items: ReviewOut[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProvidersHealthOut {
  twogis: string;
  yandex_maps: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** POST /maps/search — создать поиск, ставит Celery-задачу. */
export async function createMapSearch(payload: MapSearchCreate): Promise<MapSearchOut> {
  const response = await apiClient.post<MapSearchOut>('/maps/search', payload);
  return response.data;
}

export async function getMapSearch(id: number): Promise<MapSearchOut> {
  const response = await apiClient.get<MapSearchOut>(`/maps/search/${id}`);
  return response.data;
}

export async function listMyMapSearches(
  limit = 50,
  offset = 0,
): Promise<MapSearchOut[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const response = await apiClient.get<MapSearchOut[]>(
    `/maps/searches?${params.toString()}`,
  );
  return response.data;
}

export async function listMapCompanies(
  searchId: number,
  filter: MapSearchFilter = {},
  limit = 50,
  offset = 0
): Promise<CompaniesListOut> {
  const params = new URLSearchParams();
  if (filter.min_rating !== undefined && filter.min_rating !== null)
    params.set('min_rating', String(filter.min_rating));
  if (filter.max_rating !== undefined && filter.max_rating !== null)
    params.set('max_rating', String(filter.max_rating));
  if (filter.min_reviews !== undefined && filter.min_reviews !== null)
    params.set('min_reviews', String(filter.min_reviews));
  if (filter.min_negative !== undefined && filter.min_negative !== null)
    params.set('min_negative', String(filter.min_negative));
  if (filter.has_owner_replies !== undefined && filter.has_owner_replies !== null)
    params.set('has_owner_replies', String(filter.has_owner_replies));
  if (filter.has_website !== undefined && filter.has_website !== null)
    params.set('has_website', String(filter.has_website));
  if (filter.has_lpr !== undefined && filter.has_lpr !== null)
    params.set('has_lpr', String(filter.has_lpr));
  if (filter.pain_tag_ids && filter.pain_tag_ids.length) {
    for (const id of filter.pain_tag_ids) params.append('pain_tag_ids', String(id));
  }
  if (filter.min_pain_mentions !== undefined)
    params.set('min_pain_mentions', String(filter.min_pain_mentions));
  if (filter.review_text_contains)
    params.set('review_text_contains', filter.review_text_contains);
  if (filter.review_text_excludes)
    params.set('review_text_excludes', filter.review_text_excludes);
  if (filter.review_text_contains_any?.length)
    for (const t of filter.review_text_contains_any) params.append('review_text_contains_any', t);
  if (filter.review_text_excludes_any?.length)
    for (const t of filter.review_text_excludes_any) params.append('review_text_excludes_any', t);
  // Multi-source (ТЗ 2026-06-04). 'all' и null отправлять не надо — на сервере дефолт.
  if (filter.source_filter && filter.source_filter !== 'all')
    params.set('source_filter', filter.source_filter);
  params.set('sort_by', backendSortBy(filter.sort_by));
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const response = await apiClient.get<CompaniesListOut>(
    `/maps/search/${searchId}/companies?${params.toString()}`
  );
  return response.data;
}

export async function getCompanyDetail(id: number): Promise<CompanyDetailOut> {
  const response = await apiClient.get<CompanyDetailOut>(`/maps/companies/${id}`);
  return response.data;
}

export interface ReviewQueryFilter {
  sentiment?: 'positive' | 'negative' | 'neutral';
  /** Подстрока для ILIKE-поиска по raw_text. */
  text_contains?: string;
  min_rating?: number;
  max_rating?: number;
  has_owner_reply?: boolean;
  /** Multi-source (Phase 4): фильтр по источнику для табов «2GIS / Я.Карты». */
  source?: '2gis' | 'yandex_maps' | 'google';
  /** Юзер 2026-06-10: фильтр отзывов по конкретному pain-кластеру.
   *  Клик по pain-плитке в карточке → drawer-таб «Отзывы по теме». */
  pain_tag_id?: number;
}

export interface PainTrendPoint {
  month: string;          // 'YYYY-MM'
  source: string;         // '2gis' | 'yandex_maps' | 'google'
  count: number;
}

export interface PainTrendOut {
  company_id: number;
  pain_tag_id: number;
  source_filter: string | null;
  first_review_at: string | null;
  last_review_at: string | null;
  total_reviews: number;
  range_start: string | null;
  range_end: string | null;
  points: PainTrendPoint[];
}

export async function getCompanyPainTrend(
  companyId: number,
  painTagId: number,
  source?: '2gis' | 'yandex_maps' | 'google',
): Promise<PainTrendOut> {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  const response = await apiClient.get<PainTrendOut>(
    `/maps/companies/${companyId}/pain-tag/${painTagId}/trend?${params.toString()}`,
  );
  return response.data;
}

/** Тот же shape что PainTrendOut, но scope=niche — chart по всей нише+городу. */
export interface NichePainTrendOut extends Omit<PainTrendOut, 'company_id'> {
  niche: string;
  city: string | null;
  companies_affected: number;
}

export async function getNichePainTrend(
  niche: string,
  painTagId: number,
  city?: string | null,
  source?: '2gis' | 'yandex_maps' | 'google',
  from?: string,
  to?: string,
): Promise<NichePainTrendOut> {
  const params = new URLSearchParams({ niche, pain_tag_id: String(painTagId) });
  if (city) params.set('city', city);
  if (source) params.set('source', source);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const response = await apiClient.get<NichePainTrendOut>(
    `/maps/insights/pain-trend?${params.toString()}`,
  );
  return response.data;
}

/** 2026-06-12: динамика всех отзывов в нише+городе (без фильтра pain_tag).
 *  Юзер просил видеть общую динамику в шапке выдачи всегда — независимо
 *  от того, выбрана ли плитка боли. Shape тот же что у pain-trend. */
export async function getNicheReviewsTrend(
  niche: string,
  city?: string | null,
  source?: '2gis' | 'yandex_maps' | 'google',
  from?: string,
  to?: string,
): Promise<NichePainTrendOut> {
  const params = new URLSearchParams({ niche });
  if (city) params.set('city', city);
  if (source) params.set('source', source);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const response = await apiClient.get<NichePainTrendOut>(
    `/maps/insights/reviews-trend?${params.toString()}`,
  );
  return response.data;
}

export interface PainBenchmarkItem {
  pain_tag_id: number;
  label: string;
  description: string | null;
  company_mentions: number;
  niche_total_mentions: number;
  niche_avg_per_company: number;
  ratio: number;
  verdict: 'worse' | 'on_par' | 'better';
}

export interface PainBenchmarkOut {
  company_id: number;
  niche: string | null;
  city: string | null;
  niche_companies_total: number;
  items: PainBenchmarkItem[];
}

export async function getCompanyPainBenchmark(
  companyId: number,
): Promise<PainBenchmarkOut> {
  const response = await apiClient.get<PainBenchmarkOut>(
    `/maps/companies/${companyId}/pain-benchmark`,
  );
  return response.data;
}

export interface NegativeTrendOut {
  company_id: number;
  last_30d: number;
  prev_30d: number;
  prev_60d: number;
  verdict: 'rising' | 'stable' | 'falling' | 'no_data';
}

export async function getCompanyNegativeTrend(
  companyId: number,
): Promise<NegativeTrendOut> {
  const response = await apiClient.get<NegativeTrendOut>(
    `/maps/companies/${companyId}/negative-trend`,
  );
  return response.data;
}

export interface InsightsNicheOut {
  niche: string;
  companies_count: number;
}

export async function listInsightsNiches(): Promise<InsightsNicheOut[]> {
  const response = await apiClient.get<InsightsNicheOut[]>('/maps/insights/niches');
  return response.data;
}

export interface DemandIndexItem {
  pain_tag_id: number;
  label: string;
  description: string | null;
  total_mentions: number;
  companies_affected: number;
  share_of_companies: number;
  /** total_mentions / companies_total — среднее упоминаний на компанию по нише. */
  niche_avg_per_company: number;
}

export interface DemandIndexOut {
  niche: string;
  city: string | null;
  companies_total: number;
  items: DemandIndexItem[];
  note: 'ok' | 'small_sample';
  hint: string | null;
}

export async function getDemandIndex(
  niche: string,
  city?: string | null,
  sentiment: 'negative' | 'positive' = 'negative',
): Promise<DemandIndexOut> {
  const params = new URLSearchParams({ niche });
  if (city) params.set('city', city);
  if (sentiment !== 'negative') params.set('sentiment', sentiment);
  const response = await apiClient.get<DemandIndexOut>(
    `/maps/insights/demand-index?${params.toString()}`,
  );
  return response.data;
}

export async function getCompanyReviews(
  id: number,
  filterOrSentiment?: ReviewQueryFilter | 'positive' | 'negative' | 'neutral',
  limit = 50,
  offset = 0
): Promise<ReviewsListOut> {
  // Backwards compat: старые места передают sentiment-строку первым аргументом.
  const filter: ReviewQueryFilter =
    typeof filterOrSentiment === 'string'
      ? { sentiment: filterOrSentiment }
      : (filterOrSentiment ?? {});
  const params = new URLSearchParams();
  if (filter.sentiment) params.set('sentiment', filter.sentiment);
  if (filter.text_contains && filter.text_contains.trim())
    params.set('text_contains', filter.text_contains.trim());
  if (filter.min_rating !== undefined)
    params.set('min_rating', String(filter.min_rating));
  if (filter.max_rating !== undefined)
    params.set('max_rating', String(filter.max_rating));
  if (filter.has_owner_reply !== undefined)
    params.set('has_owner_reply', String(filter.has_owner_reply));
  if (filter.source) params.set('source', filter.source);
  if (filter.pain_tag_id !== undefined)
    params.set('pain_tag_id', String(filter.pain_tag_id));
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const response = await apiClient.get<ReviewsListOut>(
    `/maps/companies/${id}/reviews?${params.toString()}`
  );
  return response.data;
}

export type PainTagsFilter = {
  /** '2gis' | 'yandex_maps' | 'google' — пересчитывает occurrences по выбранному источнику. */
  source?: string;
  /** ISO дата ('YYYY-MM-DD') — нижняя граница posted_at. */
  from?: string;
  /** ISO дата ('YYYY-MM-DD') — верхняя граница posted_at. */
  to?: string;
  /** 'negative' (default) = боли клиентов. 'positive' = сильные стороны / что хвалят. */
  sentiment?: 'negative' | 'positive';
};

export async function listPainTags(
  niche: string,
  city?: string,
  filter?: PainTagsFilter,
): Promise<PainTagOut[]> {
  const params = new URLSearchParams({ niche });
  if (city) params.set('city', city);
  if (filter?.source) params.set('source', filter.source);
  if (filter?.from) params.set('from', filter.from);
  if (filter?.to) params.set('to', filter.to);
  if (filter?.sentiment && filter.sentiment !== 'negative') {
    params.set('sentiment', filter.sentiment);
  }
  const response = await apiClient.get<PainTagOut[]>(`/maps/pain-tags?${params.toString()}`);
  return response.data;
}

export async function getSearchPainTags(searchId: number): Promise<PainTagOut[]> {
  const response = await apiClient.get<PainTagOut[]>(`/maps/search/${searchId}/pain-tags`);
  return response.data;
}

export async function listMapCities(): Promise<string[]> {
  const response = await apiClient.get<string[]>('/maps/cities');
  return response.data;
}

export async function nicheSuggestions(q = ''): Promise<string[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const response = await apiClient.get<string[]>(
    `/maps/niche-suggestions${params.toString() ? '?' + params.toString() : ''}`
  );
  return response.data;
}

export async function getProvidersHealth(): Promise<ProvidersHealthOut> {
  const response = await apiClient.get<ProvidersHealthOut>('/maps/health/providers');
  return response.data;
}

export interface ReclusterNicheResponse {
  queued: boolean;
  niche: string;
  city: string;
  /** 2026-06-18: backend echoes selected sentiment. */
  sentiment?: 'negative' | 'positive';
  hint: string;
}

/** POST /maps/admin/recluster-niche — ручной триггер AI-разбора болей
 *  ниши/города поиска. Cron делает это раз в сутки только для top-30
 *  ниш по reviews; для редких ниш карточки навсегда оставались без
 *  pain-pills и показывали fallback NegativeSnippetsBlock.
 *
 *  sentiment='positive' (2026-06-18) — запускает кластеризацию «сильных
 *  сторон» по позитивным отзывам через STRENGTH_NAMING_PROMPT. positive-
 *  и negative-наборы pain-тегов живут независимо. */
export async function adminReclusterNiche(
  searchId: number,
  sentiment: 'negative' | 'positive' = 'negative',
): Promise<ReclusterNicheResponse> {
  const response = await apiClient.post<ReclusterNicheResponse>(
    `/maps/admin/recluster-niche?search_id=${searchId}&sentiment=${sentiment}`,
    {}
  );
  return response.data;
}

/** Прогресс AI-разбора отзывов конкретного поиска.
 *
 *  stage:
 *   - 'idle'       — нет отзывов вообще, разбирать нечего
 *   - 'analyzing'  — embeddings/sentiment ещё ставятся
 *   - 'clustering' — embeddings готовы, ждём финальной кластеризации
 *   - 'ready'      — pain-теги начали появляться у компаний
 */
export interface MapsAiProgressOut {
  companies_total: number;
  companies_with_pains: number;
  reviews_total: number;
  reviews_with_embedding: number;
  reviews_with_sentiment: number;
  /** Кол-во активных pain-тегов в (search.niche, search.city). 0 при
   *  stage=clustering означает, что recluster ещё не дошёл / упал. */
  pain_tags_total: number;
  stage: 'idle' | 'analyzing' | 'clustering' | 'ready';
  percent: number;
}

export async function getMapsAiProgress(searchId: number): Promise<MapsAiProgressOut> {
  const response = await apiClient.get<MapsAiProgressOut>(
    `/maps/search/${searchId}/ai-progress`,
  );
  return response.data;
}

/** Синхронный recluster для отладки. Выполняет кластеризацию прямо в HTTP-запросе
 *  и возвращает все промежуточные счётчики. Юзер нажимает «Запустить диагностику»
 *  на stuck-плашке — за 30-60 сек получает точную причину почему ничего не вышло. */
export interface MapsReclusterDiagnosticOut {
  search_id: number;
  niche: string;
  city: string | null;
  companies_total: number;
  reviews_with_embedding: number;
  clusters_found: number;
  pain_tags_upserted: number;
  companies_with_pains_after: number;
  error: string | null;
}

export async function adminReclusterNicheDiagnostic(
  searchId: number,
): Promise<MapsReclusterDiagnosticOut> {
  const response = await apiClient.post<MapsReclusterDiagnosticOut>(
    `/maps/admin/recluster-niche/diagnostic?search_id=${searchId}`,
    {},
    { timeout: 180_000 }, // до 3 мин: синхронный HDBSCAN на 3к точек небыстрый
  );
  return response.data;
}

/** POST /maps/companies/{id}/draft-email — LLM-генерация драфта холодного письма. */
export async function draftEmailForCompany(companyId: number): Promise<OutreachDraftOut> {
  const response = await apiClient.post<OutreachDraftOut>(
    `/maps/companies/${companyId}/draft-email`,
    {}
  );
  return response.data;
}

/** POST /maps/companies/{id}/outreach-draft — Aha-moment блок 1.
 *
 * Поддерживает угол услуги (website/reputation/automation/seo/auto), кэш
 * по (company_id, angle), regenerate=true для перезаписи. Работает даже
 * когда у компании нет pain-тегов (полезно для website-угла).
 */
export async function generateOutreachDraft(
  companyId: number,
  payload: OutreachDraftRequest = {}
): Promise<OutreachDraftCachedOut> {
  const response = await apiClient.post<OutreachDraftCachedOut>(
    `/maps/companies/${companyId}/outreach-draft`,
    payload
  );
  return response.data;
}

export interface CompanyDigestOut {
  company_id: number;
  /** null = «за всё время» (запрос пришёл с days=0). */
  days: number | null;
  total_reviews: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  avg_rating: number | null;
  owner_reply_rate: number | null;
  top_pains: CompanyPainOut[];
  /** Топ-3 самых ярких негативных отзыва за всё время. Не зависит от `days`. */
  top_negative_reviews_all_time: ReviewOut[];
}

/**
 * GET /maps/companies/{id}/digest — сводка отзывов за N дней.
 * `days === null` (или 0) → «за всё время», бэк снимает фильтр по posted_at.
 */
export async function getCompanyDigest(
  companyId: number,
  days: number | null = 30
): Promise<CompanyDigestOut> {
  const dParam = days == null ? 0 : days;
  const response = await apiClient.get<CompanyDigestOut>(
    `/maps/companies/${companyId}/digest?days=${dParam}`
  );
  return response.data;
}

/**
 * Bulk-обогащение ЛПР по выбранным компаниям. POST /maps/companies/enrich-team.
 * Идемпотентно — компании с уже найденными ЛПР пропускаются.
 *
 * Возвращает счётчики:
 *  queued — сколько компаний реально поставлены в Celery
 *  skipped_no_website — пропущены т.к. нет сайта (LLM-краулинг невозможен)
 *  skipped_already_has_lpr — уже обогащены ранее
 */
export interface EnrichTeamResponse {
  queued: number;
  skipped_no_website: number;
  skipped_already_has_lpr: number;
}

export async function enrichCompaniesTeam(
  searchId: number,
  companyIds: number[],
): Promise<EnrichTeamResponse> {
  const resp = await apiClient.post<EnrichTeamResponse>(
    `/maps/companies/enrich-team`,
    { search_id: searchId, company_ids: companyIds },
  );
  return resp.data;
}

/** Возвращает URL для скачивания CSV — браузер сам инициирует загрузку.
 *
 *  Два режима:
 *  - `companyIds=undefined` (default) — экспорт всех с применением `filter`.
 *  - `companyIds=[…]` — bulk-режим: экспорт только выбранных карточек.
 *    Бэкенд игнорирует `filter` (юзер уже отметил конкретные строки).
 */
export function exportSearchCsvUrl(
  searchId: number,
  filter: MapSearchFilter = {},
  companyIds?: number[],
): string {
  const params = new URLSearchParams();
  if (companyIds && companyIds.length) {
    for (const id of companyIds) params.append('company_ids', String(id));
    return `/api/v1/maps/search/${searchId}/export?${params.toString()}`;
  }
  if (filter.min_rating !== undefined && filter.min_rating !== null)
    params.set('min_rating', String(filter.min_rating));
  if (filter.max_rating !== undefined && filter.max_rating !== null)
    params.set('max_rating', String(filter.max_rating));
  if (filter.min_reviews !== undefined && filter.min_reviews !== null)
    params.set('min_reviews', String(filter.min_reviews));
  if (filter.min_negative !== undefined && filter.min_negative !== null)
    params.set('min_negative', String(filter.min_negative));
  if (filter.has_owner_replies !== undefined && filter.has_owner_replies !== null)
    params.set('has_owner_replies', String(filter.has_owner_replies));
  if (filter.has_website !== undefined && filter.has_website !== null)
    params.set('has_website', String(filter.has_website));
  if (filter.has_lpr !== undefined && filter.has_lpr !== null)
    params.set('has_lpr', String(filter.has_lpr));
  if (filter.pain_tag_ids && filter.pain_tag_ids.length)
    for (const id of filter.pain_tag_ids) params.append('pain_tag_ids', String(id));
  params.set('sort_by', backendSortBy(filter.sort_by));
  return `/api/v1/maps/search/${searchId}/export?${params.toString()}`;
}
