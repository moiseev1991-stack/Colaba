/**
 * Типы данных для SpinLid MVP
 */

export interface User {
  email: string;
  name: string;
}

export interface Run {
  id: string;
  keyword: string;
  geoCity: string;
  engine: string;
  createdAt: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  resultCount?: number;
}

export interface IssueCheck {
  robots: boolean; // true = OK (✓), false = bad (✗)
  sitemap: boolean;
  titleDuplicates: boolean;
  descriptionDuplicates: boolean;
}

export interface SEOData {
  robots: 'OK' | 'не найден' | 'Disallow:/';
  sitemap: 'OK' | 'не найдена';
  metaTitle: string; // найден% / дублируется%
  metaDesc: string; // не найден% / дублируется%
  h1: string; // не найден % / дублируется%
  http: '200' | '3xx' | '4xx' | '5xx';
  pagesCrawled: number; // сколько страниц проверили (до 20)
}

export interface LeadRow {
  id: string;
  domain: string;
  phone: string | null;
  email: string | null;
  score: number;
  issues: IssueCheck;
  seo?: SEOData; // Новые SEO данные
  // processing: domain parser is still running in background
  status: 'ok' | 'error' | 'processing';
  outreachText: string;
  outreachSubject?: string | null;
  /** Из результатов поиска — показываем сразу без SEO-аудита */
  titleFromSearch?: string | null;
  snippetFromSearch?: string | null;
  urlFromSearch?: string | null;
  /** Meta description главной страницы, как её увидел наш краулер.
   *  Используется как основной источник «о компании» — он осмысленнее, чем
   *  поисковый snippet, который Яндекс склеивает под пользовательский запрос. */
  siteMetaDescription?: string | null;
  /** Title главной страницы (с самого сайта). Фолбек, если meta-desc пустой. */
  sitePageTitle?: string | null;
  /** Backend-cleaned, ready-to-show description (emoji/whitespace stripped,
   *  short noise discarded). When null, fall back to siteMetaDescription/title. */
  cleanDescription?: string | null;
  /** Coarse site type from the backend classifier — drives the «тип» badge
   *  and the default "только компании" filter. */
  siteType?: SiteType | null;
  /** Keywords (from the per-search FTS filter) actually found on this site. */
  keywordHits?: string[] | null;
}

export type SiteType =
  | 'company'
  | 'catalog'
  | 'market'
  | 'social'
  | 'news'
  | 'gov'
  | 'broken'
  | 'unknown';

export interface BlacklistItem {
  id: string;
  domain: string;
  addedAt: number;
}

export type Theme = 'dark' | 'light';
