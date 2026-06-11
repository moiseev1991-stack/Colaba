/**
 * Тонкий API клиент для существующего модуля /searches (web-search jobs).
 *
 * Создаёт поиск + поллит результаты. Используется вкладкой «Сайты»
 * (Эпик F): юзер вводит вхождение (например «© 2021»), POST /searches,
 * результаты подтягиваются GET /searches/{id}/results.
 */

import { apiClient } from '@/client';

export type WebSearchProvider =
  | 'yandex_xml'
  | 'yandex_html'
  | 'google_html';

export type WebSearchStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WebSearchOut {
  id: number;
  query: string;
  status: WebSearchStatus;
  search_provider: string;
  num_results: number;
  result_count: number;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface WebSearchResult {
  id: number;
  search_id: number;
  position: number;
  title: string;
  url: string;
  snippet: string | null;
  domain: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface WebSearchCreate {
  query: string;
  search_provider?: WebSearchProvider;
  num_results?: number;
}

export async function createWebSearch(payload: WebSearchCreate): Promise<WebSearchOut> {
  const r = await apiClient.post<WebSearchOut>('/searches', {
    query: payload.query,
    search_provider: payload.search_provider ?? 'yandex_xml',
    num_results: payload.num_results ?? 30,
  });
  return r.data;
}

export async function getWebSearch(id: number): Promise<WebSearchOut> {
  const r = await apiClient.get<WebSearchOut>(`/searches/${id}`);
  return r.data;
}

export async function getWebSearchResults(id: number): Promise<WebSearchResult[]> {
  const r = await apiClient.get<WebSearchResult[]>(`/searches/${id}/results`);
  return r.data;
}
