/**
 * Dashboard API client.
 */

import { apiClient } from '@/client';
import { cachedFetch } from '@/lib/apiCache';

export interface DashboardKpi {
  total: number;
  success: number;
  errors: number;
  avg_time_sec: number | null;
  cost_rub: number;
  results: number;
  has_cost_tarification: boolean;
}

export interface RunsByDayItem {
  date: string;
  total: number;
  success: number;
  errors: number;
  running: number;
}

export interface ActiveRunItem {
  id: string;
  module: string;
  query: string;
  status: string;
  started_at: string;
  progress?: { found: number; total: number };
  duration_sec?: number;
}

export interface RecentRunItem {
  id: string;
  module: string;
  query: string;
  status: string;
  created_at: string;
  results: number;
  cost_rub?: number;
}

export interface DashboardResponse {
  kpi: DashboardKpi;
  runs_by_day: RunsByDayItem[];
  active_runs: ActiveRunItem[];
  recent_runs: RecentRunItem[];
}

export type DashboardPeriod = 'day' | 'week' | 'month' | 'custom';
export type DashboardModule = 'all' | 'seo' | 'leads' | 'tenders';

export async function getDashboard(
  params: {
    period?: DashboardPeriod;
    date_from?: string;
    date_to?: string;
    module?: DashboardModule;
  } = {}
): Promise<DashboardResponse> {
  const searchParams = new URLSearchParams();
  if (params.period) searchParams.set('period', params.period);
  if (params.date_from) searchParams.set('date_from', params.date_from);
  if (params.date_to) searchParams.set('date_to', params.date_to);
  if (params.module) searchParams.set('module', params.module);
  const qs = searchParams.toString();
  const url = qs ? `/dashboard?${qs}` : '/dashboard';
  const cacheKey = `dashboard:${qs}`;
  return cachedFetch(cacheKey, async () => {
    const response = await apiClient.get<DashboardResponse>(url);
    return response.data;
  }, 20_000); // 20 s TTL — dashboard data is not real-time
}
