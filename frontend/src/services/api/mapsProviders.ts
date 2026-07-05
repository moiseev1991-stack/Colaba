import { apiClient } from '@/client';

export type MapProviderId = 'twogis' | 'yandex_maps' | 'google_maps';

export type MapProviderStatusValue =
  | 'ok'
  | 'no_api_key'
  | 'disabled'
  | 'no_proxy';

export interface MapProviderField {
  key: 'api_key' | 'secondary_key';
  label: string;
  type: 'secret';
  secret: boolean;
  required: boolean;
  description?: string;
}

export interface MapProviderConfigDTO {
  provider_id: MapProviderId;
  name: string;
  description: string;
  source_label: string;
  fields: MapProviderField[];
  /** '***' если секрет задан, null если пусто. */
  api_key: string | null;
  /** '***' если секрет задан, null если пусто. */
  secondary_key: string | null;
  is_enabled: boolean;
  is_configured: boolean;
  last_test_at: string | null;
  last_test_result: 'ok' | 'no_api_key' | 'error' | null;
  last_test_error: string | null;
}

export interface MapProviderUpdate {
  api_key?: string | null;
  secondary_key?: string | null;
  is_enabled?: boolean;
  notes?: string | null;
}

export interface MapProviderTestResult {
  ok: boolean;
  result_count?: number | null;
  error?: string | null;
}

export type MapsProvidersStatus = Record<MapProviderId, MapProviderStatusValue>;

/**
 * Список 3 провайдеров с метаданными + замаскированными секретами.
 * Только superuser.
 */
export async function getMapsProvidersSettings(): Promise<MapProviderConfigDTO[]> {
  const response = await apiClient.get<MapProviderConfigDTO[]>('/maps/providers-settings');
  return response.data;
}

/**
 * Обновить конфиг провайдера. Только superuser.
 * Секреты со значением '***' / '' / undefined НЕ перезаписывают существующие.
 */
export async function updateMapsProvider(
  providerId: MapProviderId,
  data: MapProviderUpdate,
): Promise<MapProviderConfigDTO> {
  const response = await apiClient.put<MapProviderConfigDTO>(
    `/maps/providers-settings/${providerId}`,
    data,
  );
  return response.data;
}

/**
 * Реальный test-вызов провайдера (Catalog API ping для 2GIS, SerpAPI для Google,
 * HTTP-доступность для Yandex). Только superuser.
 */
export async function testMapsProvider(
  providerId: MapProviderId,
): Promise<MapProviderTestResult> {
  const response = await apiClient.post<MapProviderTestResult>(
    `/maps/providers-settings/${providerId}/test`,
    {},
  );
  return response.data;
}

/**
 * Краткий статус всех провайдеров для бейджей в UI. Публичный (для любого
 * авторизованного юзера). Возвращает {twogis: 'ok'|'no_api_key'|..., ...}.
 */
export async function getMapsProvidersStatus(): Promise<MapsProvidersStatus> {
  const response = await apiClient.get<MapsProvidersStatus>(
    '/maps/providers-settings/status',
  );
  return response.data;
}
