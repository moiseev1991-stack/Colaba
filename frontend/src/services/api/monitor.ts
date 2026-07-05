/**
 * Monitor API: список последних внешних API-вызовов + агрегаты стоимости.
 *
 * До миграции 044 backend отдавал mock-данные; теперь — реальные записи
 * из таблицы api_call_log (трекер app.core.api_tracker). Старые поля
 * (id/method/url/response_time_ms/ok/phone) сохранены для обратной
 * совместимости; добавлены новые — provider/cost_rub/model/tokens.
 */

import { apiClient } from '@/client';

export interface MonitorRequest {
  // Старые поля (совместимость):
  id: string;
  method: string;
  url: string;
  response_time_ms: number;
  phone: string | null;
  ok: boolean;
  // Новые поля (cost tracking):
  provider: string;
  cost_rub: number;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  user_id: number | null;
  map_search_id: number | null;
  company_id: number | null;
  http_status: number | null;
  error: string | null;
  created_at: string | null;
}

export interface MonitorRequestsResponse {
  updated_at: string;
  requests: MonitorRequest[];
}

export interface MonitorProviderRow {
  provider: string;
  calls: number;
  cost_rub: number;
  ok_pct?: number;
}

export interface MonitorSummaryResponse {
  period: string;
  since: string | null;
  until: string;
  total_cost_rub: number;
  total_calls: number;
  ok_calls: number;
  failed_calls: number;
  tokens: { prompt_total: number; completion_total: number };
  by_provider: MonitorProviderRow[];
}

export async function getMonitorRequests(): Promise<MonitorRequestsResponse> {
  const r = await apiClient.get<MonitorRequestsResponse>('/monitor/requests');
  return r.data;
}

export async function getMonitorSummary(
  period: 'day' | 'week' | 'month' | 'all' = 'day',
): Promise<MonitorSummaryResponse> {
  const r = await apiClient.get<MonitorSummaryResponse>('/monitor/summary', {
    params: { period },
  });
  return r.data;
}

export async function getMonitorBySearch(
  mapSearchId: number,
): Promise<MonitorSummaryResponse & { map_search_id: number }> {
  const r = await apiClient.get<MonitorSummaryResponse & { map_search_id: number }>(
    `/monitor/by-search/${mapSearchId}`,
  );
  return r.data;
}
