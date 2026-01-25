/**
 * Search API client.
 */

import { apiClient } from '@/client';

export interface SearchCreate {
  query: string;
  search_provider?: string;
  num_results?: number;
  config?: Record<string, any>;
}

export interface SearchResponse {
  id: number;
  query: string;
  status: string;
  search_provider: string;
  num_results: number;
  result_count: number;
  config?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface SearchResultResponse {
  id: number;
  search_id: number;
  position: number;
  title: string;
  url: string;
  snippet?: string;
  domain?: string;
  seo_score?: number;
  phone?: string;
  email?: string;
  contact_status?: string;
  outreach_subject?: string;
  outreach_text?: string;
  extra_data?: Record<string, any>;
  created_at: string;
}

/**
 * Create a new search.
 */
export async function createSearch(data: SearchCreate): Promise<SearchResponse> {
  const response = await apiClient.post<SearchResponse>('/searches', data);
  return response.data;
}

/**
 * Get all searches.
 */
export async function listSearches(): Promise<SearchResponse[]> {
  const response = await apiClient.get<SearchResponse[]>('/searches');
  return response.data;
}

/**
 * Get a specific search by ID.
 */
export async function getSearch(id: number): Promise<SearchResponse> {
  const response = await apiClient.get<SearchResponse>(`/searches/${id}`);
  return response.data;
}

/**
 * Get search results.
 */
export async function getSearchResults(searchId: number): Promise<SearchResultResponse[]> {
  const response = await apiClient.get<SearchResultResponse[]>(`/searches/${searchId}/results`);
  return response.data;
}

/**
 * Delete a search.
 */
export async function deleteSearch(id: number): Promise<void> {
  await apiClient.delete(`/searches/${id}`);
}

/**
 * Run SEO audit for one search result. Updates extra_data.audit and seo_score.
 */
export async function runResultAudit(
  searchId: number,
  resultId: number
): Promise<SearchResultResponse> {
  const response = await apiClient.post<SearchResultResponse>(
    `/searches/${searchId}/results/${resultId}/audit`
  );
  return response.data;
}
