/**
 * API клиент для AI-анализа компаний под кастомный промпт пресета.
 *
 * Поток: юзер применил пресет с ai_prompt → фронт зовёт runPresetAnalysis
 * → бэк ставит таски → фронт поллит getCompanyAnalyses каждые ~3 сек
 * чтобы наполнить бейджи в карточках.
 */

import { apiClient } from '@/client';

export interface RunPresetAnalysisOut {
  queued: number;
  cached: number;
  skipped: number;
  limit_remaining: number;
  limit_total: number;
  over_limit: number;
}

export interface CompanyAnalysisOut {
  company_id: number;
  score: number | null;
  comment: string | null;
  status: 'pending' | 'done' | 'failed';
  error: string | null;
}

export async function runPresetAnalysis(
  preset_id: number,
  company_ids: number[],
): Promise<RunPresetAnalysisOut> {
  const response = await apiClient.post<RunPresetAnalysisOut>(
    '/reviews-ai/run-preset-analysis',
    { preset_id, company_ids },
  );
  return response.data;
}

export async function getCompanyAnalyses(
  preset_id: number,
  company_ids: number[],
): Promise<CompanyAnalysisOut[]> {
  const params = new URLSearchParams({ preset_id: String(preset_id) });
  for (const cid of company_ids) params.append('company_ids', String(cid));
  const response = await apiClient.get<CompanyAnalysisOut[]>(
    `/reviews-ai/company-analyses?${params.toString()}`,
  );
  return response.data;
}
