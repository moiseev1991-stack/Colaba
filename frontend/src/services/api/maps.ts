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

export type MapSource = '2gis' | 'yandex_maps';

export type SortBy =
  | 'rating_asc'
  | 'rating_desc'
  | 'reviews_desc'
  | 'negative_desc'
  | 'pain_desc';

export interface MapSearchFilter {
  min_rating?: number | null;
  max_rating?: number | null;
  min_reviews?: number | null;
  min_negative?: number | null;
  has_owner_replies?: boolean | null;
  /** true — только компании с сайтом, false — только без сайта, null — не важно. */
  has_website?: boolean | null;
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

export interface CompanyOut {
  id: number;
  name: string;
  niche?: string | null;
  city?: string | null;
  address?: string | null;
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
  pain_tags: PainTagShort[];
  emails?: string[] | null;
  contacts_extra?: Record<string, unknown> | null;
  top_pains?: CompanyPainOut[];
}

export interface OutreachDraftOut {
  company_id: number;
  company_name: string;
  subject: string;
  body: string;
  used_pains: CompanyPainOut[];
  suggested_to_emails: string[];
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
}

export interface CompanyDetailOut extends CompanyOut {
  recent_reviews: ReviewOut[];
}

export interface CompaniesListOut {
  items: CompanyOut[];
  total: number;
  limit: number;
  offset: number;
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
  params.set('sort_by', filter.sort_by ?? 'rating_desc');
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
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const response = await apiClient.get<ReviewsListOut>(
    `/maps/companies/${id}/reviews?${params.toString()}`
  );
  return response.data;
}

export async function listPainTags(niche: string, city?: string): Promise<PainTagOut[]> {
  const params = new URLSearchParams({ niche });
  if (city) params.set('city', city);
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

/** POST /maps/companies/{id}/draft-email — LLM-генерация драфта холодного письма. */
export async function draftEmailForCompany(companyId: number): Promise<OutreachDraftOut> {
  const response = await apiClient.post<OutreachDraftOut>(
    `/maps/companies/${companyId}/draft-email`,
    {}
  );
  return response.data;
}

export interface CompanyDigestOut {
  company_id: number;
  days: number;
  total_reviews: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  avg_rating: number | null;
  owner_reply_rate: number | null;
  top_pains: CompanyPainOut[];
}

/** GET /maps/companies/{id}/digest — сводка отзывов за N дней. */
export async function getCompanyDigest(
  companyId: number,
  days: number = 30
): Promise<CompanyDigestOut> {
  const response = await apiClient.get<CompanyDigestOut>(
    `/maps/companies/${companyId}/digest?days=${days}`
  );
  return response.data;
}

/** Возвращает URL для скачивания CSV — браузер сам инициирует загрузку. */
export function exportSearchCsvUrl(searchId: number, filter: MapSearchFilter = {}): string {
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
  if (filter.pain_tag_ids && filter.pain_tag_ids.length)
    for (const id of filter.pain_tag_ids) params.append('pain_tag_ids', String(id));
  params.set('sort_by', filter.sort_by ?? 'rating_desc');
  return `/api/v1/maps/search/${searchId}/export?${params.toString()}`;
}
