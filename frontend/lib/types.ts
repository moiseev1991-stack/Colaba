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
}

export interface BlacklistItem {
  id: string;
  domain: string;
  addedAt: number;
}

export type Theme = 'dark' | 'light';
