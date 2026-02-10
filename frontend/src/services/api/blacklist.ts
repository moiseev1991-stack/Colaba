/**
 * Blacklist API client.
 * Добавление доменов в блэклист.
 */

import { apiClient } from '@/client';

export interface BlacklistDomainResponse {
  id: number;
  domain: string;
  created_at: string;
}

/**
 * Добавить домен в блэклист.
 */
export async function addDomainToBlacklist(domain: string): Promise<BlacklistDomainResponse> {
  const response = await apiClient.post<BlacklistDomainResponse>('/filters/blacklist', {
    domain,
  });
  return response.data;
}
