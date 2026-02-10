/**
 * Search providers API client.
 */

import { apiClient } from '@/client';

export interface SettingsSchemaField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  secret: boolean;
  description?: string;
}

export interface ProviderItem {
  id: string;
  name: string;
  type: string;
  description: string;
  settings_schema: SettingsSchemaField[];
  config: Record<string, unknown>;
  configured: boolean;
}

export interface ProviderTestResponse {
  ok: boolean;
  result_count?: number;
  error?: string;
}

export async function listProviders(): Promise<ProviderItem[]> {
  const response = await apiClient.get<ProviderItem[]>('/providers');
  return response.data;
}

export async function getProvider(id: string): Promise<ProviderItem> {
  const response = await apiClient.get<ProviderItem>(`/providers/${id}`);
  return response.data;
}

export async function updateProvider(id: string, config: Record<string, unknown>): Promise<{ provider_id: string; config: Record<string, unknown> }> {
  const response = await apiClient.put<{ provider_id: string; config: Record<string, unknown> }>(`/providers/${id}`, { config });
  return response.data;
}

export async function testProvider(
  id: string,
  query?: string,
  config?: Record<string, unknown>
): Promise<ProviderTestResponse> {
  const body: { query: string; config?: Record<string, unknown> } = { query: query ?? 'кофе москва' };
  if (config != null && Object.keys(config).length > 0) body.config = config;
  const response = await apiClient.post<ProviderTestResponse>(`/providers/${id}/test`, body);
  return response.data;
}
