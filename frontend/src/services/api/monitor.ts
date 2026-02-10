/**
 * Monitor API: mock request list for Live API Requests Table.
 */

import { apiClient } from '@/client';

export interface MonitorRequest {
  id: string;
  method: string;
  url: string;
  response_time_ms: number;
  phone: string | null;
  ok: boolean;
}

export interface MonitorRequestsResponse {
  updated_at: string;
  requests: MonitorRequest[];
}

export async function getMonitorRequests(): Promise<MonitorRequestsResponse> {
  const r = await apiClient.get<MonitorRequestsResponse>('/monitor/requests');
  return r.data;
}
