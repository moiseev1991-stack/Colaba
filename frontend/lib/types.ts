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

export interface LeadRow {
  id: string;
  domain: string;
  phone: string | null;
  email: string | null;
  score: number;
  issues: IssueCheck;
  status: 'ok' | 'error';
  outreachText: string;
}

export interface BlacklistItem {
  id: string;
  domain: string;
  addedAt: number;
}

export type Theme = 'dark' | 'light';
