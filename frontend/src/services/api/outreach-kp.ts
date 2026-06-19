/**
 * API клиент KP-конвейера (Эпик A фокус-релиза «КП-конвейер»).
 *
 * Endpoints:
 *  - GET  /outreach/kp/templates   → список шаблонов профиля отправителя
 *  - POST /outreach/kp/generate    → сгенерировать КП по компании+шаблону
 *
 * Соответствует backend/app/modules/outreach/kp_schemas.py.
 */

import { apiClient } from '@/client';

export interface KpTemplate {
  id: number;
  /** Стабильный ключ: 'webstudio' | 'seo' | 'marketing' | 'custom' (на старте). */
  key: string;
  title: string;
  sender_profile: string;
  offer_hint: string;
  is_system: boolean;
}

/** Снимок «на чём построено письмо». Поля null'абельны — для UI-блока
 * «Аргументы» рисуем только те, что не пусты. */
export interface KpArgumentsUsed {
  pain_label: string | null;
  quote: string | null;
  mention_count: number | null;
  trend: string | null; // rising | stable | falling | no_data
  trend_phrase: string | null;
  benchmark_ratio: number | null;
  benchmark_phrase: string | null;
  source: string | null;
  /** Эпик F: поля для КП по сайту (заполнены только если KpDraft по
   *  site_lead_id, а не по company_id). */
  site_url?: string | null;
  site_domain?: string | null;
  entry?: string | null;
  entry_meaning?: string | null;
  sender_profile: string;
  offer_hint: string;
  tone: string;
  template_key: string;
}

export interface KpDraft {
  id: number;
  /** Эпик F: либо company_id, либо site_lead_id (XOR). */
  company_id: number | null;
  site_lead_id?: number | null;
  template_key: string;
  subject: string;
  body: string;
  arguments_used: KpArgumentsUsed;
  /** Осталось бесплатных КП в месяце (Эпик E). null = счётчик ещё не запущен. */
  remaining_free: number | null;
  created_at: string;
}

export type KpTone = 'neutral' | 'bold';

export interface KpGenerateRequest {
  /** XOR с site_lead_id. Бэк model_validator гарантирует ровно одно из двух. */
  company_id?: number | null;
  /** Эпик F: КП по найденному web-search'ем сайту. */
  site_lead_id?: number | null;
  template_key: string;
  tone?: KpTone;
  /** Для template_key='custom' — текст профиля отправителя. */
  custom_sender_profile?: string | null;
}

export async function listKpTemplates(): Promise<KpTemplate[]> {
  const r = await apiClient.get<KpTemplate[]>('/outreach/kp/templates');
  return r.data;
}

export async function generateKp(req: KpGenerateRequest): Promise<KpDraft> {
  const r = await apiClient.post<KpDraft>('/outreach/kp/generate', req);
  return r.data;
}

export interface KpDraftUpdateRequest {
  subject?: string;
  body?: string;
}

/** PATCH /outreach/kp/drafts/{id} — сохранить правки темы/тела поверх
 *  AI-генерации. arguments_used не меняется (это снимок исходного LLM-
 *  контекста). */
export async function updateKpDraft(
  draftId: number,
  patch: KpDraftUpdateRequest,
): Promise<KpDraft> {
  const r = await apiClient.patch<KpDraft>(
    `/outreach/kp/drafts/${draftId}`,
    patch,
  );
  return r.data;
}

// --- Bulk-генерация КП (миграция 036) --------------------------------------

export type KpBulkJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'cancelled'
  | 'failed';

export interface KpBulkDraftPreview {
  id: number;
  company_id: number | null;
  subject: string;
  created_at: string;
}

export interface KpBulkJob {
  id: number;
  status: KpBulkJobStatus;
  template_key: string;
  tone: string;
  total: number;
  generated: number;
  failed: number;
  last_company_id: number | null;
  cancel_requested: boolean;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  recent_drafts: KpBulkDraftPreview[];
}

export interface KpBulkGenerateRequest {
  company_ids: number[];
  template_key: string;
  tone?: KpTone;
  custom_sender_profile?: string | null;
}

export async function startBulkKpGeneration(
  req: KpBulkGenerateRequest,
): Promise<KpBulkJob> {
  const r = await apiClient.post<KpBulkJob>('/outreach/kp/bulk-generate', req);
  return r.data;
}

export async function getBulkKpJob(jobId: number): Promise<KpBulkJob> {
  const r = await apiClient.get<KpBulkJob>(`/outreach/kp/jobs/${jobId}`);
  return r.data;
}

export async function cancelBulkKpJob(jobId: number): Promise<KpBulkJob> {
  const r = await apiClient.post<KpBulkJob>(
    `/outreach/kp/jobs/${jobId}/cancel`,
    {},
  );
  return r.data;
}

// --- Список всех КП юзера (для вкладки «КП» в History) ---------------------

export interface KpDraftListItem {
  id: number;
  company_id: number | null;
  site_lead_id: number | null;
  company_name: string | null;
  company_city: string | null;
  template_key: string;
  subject: string;
  body_preview: string;
  created_at: string;
}

export interface KpDraftListResponse {
  items: KpDraftListItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function listKpDrafts(params: {
  limit?: number;
  offset?: number;
} = {}): Promise<KpDraftListResponse> {
  const r = await apiClient.get<KpDraftListResponse>('/outreach/kp/drafts', {
    params: {
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  });
  return r.data;
}

// --- Страница массового просмотра/правки КП после bulk-job ----------------

/** Полная карточка КП для страницы /outreach/kp/jobs/{id}: с полным body
 *  (для in-place правки) + company-метаданными + opf-пиллом. */
export interface KpJobDraftDetail {
  id: number;
  company_id: number | null;
  site_lead_id: number | null;
  company_name: string | null;
  company_city: string | null;
  /** «ООО» / «ИП» / «АО» — для пилла-OPF на карточке. */
  company_legal_short: string | null;
  template_key: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface KpJobDetailResponse {
  job: KpBulkJob;
  drafts: KpJobDraftDetail[];
}

export async function getKpJobDrafts(jobId: number): Promise<KpJobDetailResponse> {
  const r = await apiClient.get<KpJobDetailResponse>(
    `/outreach/kp/jobs/${jobId}/drafts`,
  );
  return r.data;
}
