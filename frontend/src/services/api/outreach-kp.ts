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

// --- Страница партии КП (табличный вид всех компаний + per-row статус) ----

export type KpJobItemStatus = 'queued' | 'running' | 'done' | 'failed';

/** Строка таблицы на странице партии: компания + статус + (если готов) draft. */
export interface KpJobItem {
  company_id: number | null;
  company_name: string | null;
  company_city: string | null;
  company_legal_short: string | null;
  status: KpJobItemStatus;
  /** Заполнено при status='done' (и иногда 'failed' с уцелевшим draft'ом). */
  draft_id: number | null;
  template_key: string | null;
  subject: string | null;
  body: string | null;
  draft_created_at: string | null;
  /** Первый валидный email из company.emails. null → у компании нет
   *  адресата, UI блокирует «Отправить» для этой строки. */
  recipient_email: string | null;
  /** URL логотипа компании (из 2GIS raw_data). null → UI рисует
   *  инициалы из company_name. */
  company_logo_url: string | null;
  /** Основной телефон компании (как лежит в companies.phone). Используется
   *  фронтом как fallback-канал «нет email → wa.me/{phone}». Нормализация
   *  на фронте (utils/phone). */
  company_phone: string | null;
  /** Статус последней email-отправки этого draft'а. Используется чтобы
   *  RowSendButton после reload показывал ✓ Отправлено и не давал
   *  случайно отправить повторно. null — ещё не пытались. */
  email_send_status: KpSendStatus | null;
  /** ИНН (company_legal.inn) — для раскрывающегося списка «Кто получит КП»
   *  в SendBar. null — нет матча с реестром юр. лиц. */
  company_inn: string | null;
  /** Полное юр. название (company_legal.legal_name) — «Общество с
   *  ограниченной ответственностью Ромашка». null → UI fallback'ится
   *  на `company_name`. */
  company_legal_full: string | null;
  /** Адрес компании (companies.address). null → '—'. */
  company_address: string | null;
}

export interface KpJobItemsResponse {
  job: KpBulkJob;
  items: KpJobItem[];
}

/** GET /outreach/kp/jobs/{id}/items — таблица всех компаний партии + прогресс. */
export async function getKpJobItems(jobId: number): Promise<KpJobItemsResponse> {
  const r = await apiClient.get<KpJobItemsResponse>(
    `/outreach/kp/jobs/${jobId}/items`,
  );
  return r.data;
}

// --- Список партий (вкладка «Партии КП» в History) ------------------------

export interface KpJobListItem {
  id: number;
  status: KpBulkJobStatus;
  template_key: string;
  tone: string;
  total: number;
  generated: number;
  failed: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface KpJobListResponse {
  items: KpJobListItem[];
}

export async function listKpJobs(limit = 50): Promise<KpJobListResponse> {
  const r = await apiClient.get<KpJobListResponse>('/outreach/kp/jobs', {
    params: { limit },
  });
  return r.data;
}

// --- Отправка КП (миграция 038, 2026-06-21) -------------------------------

export type KpSendChannel = 'email' | 'telegram' | 'whatsapp' | 'max';

export type KpSendStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'skipped';

export interface KpJobSendStatus {
  job_id: number;
  total: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  /** true пока есть строки в queued/sending — UI оставляет спиннер. */
  is_active: boolean;
  /** Последняя ошибка отправки (если есть) — для toast'а в UI. */
  last_error: string | null;
}

export interface KpSendListItem {
  id: number;
  job_id: number | null;
  draft_id: number;
  company_id: number | null;
  company_name: string | null;
  company_city: string | null;
  subject: string | null;
  template_key: string | null;
  channel: KpSendChannel;
  recipient: string | null;
  status: KpSendStatus;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface KpSendListResponse {
  items: KpSendListItem[];
  total: number;
  limit: number;
  offset: number;
}

/** POST /outreach/kp/jobs/{id}/send — поставить отправку КП партии в
 * очередь по выбранным каналам. На канале email шлёт через EmailService;
 * остальные пока создают строки 'skipped'.
 *
 * draftIds — опциональный фильтр: если передан, отправляем только эти
 * конкретные драфты партии (per-row resend одной/нескольких строк).
 * Если опущен/пуст — bulk: все готовые драфты партии. */
export async function sendKpJob(
  jobId: number,
  channels: KpSendChannel[],
  draftIds?: number[] | null,
): Promise<KpJobSendStatus> {
  const body: { channels: KpSendChannel[]; draft_ids?: number[] } = {
    channels,
  };
  if (draftIds && draftIds.length > 0) body.draft_ids = draftIds;
  const r = await apiClient.post<KpJobSendStatus>(
    `/outreach/kp/jobs/${jobId}/send`,
    body,
  );
  return r.data;
}

/** GET /outreach/kp/jobs/{id}/send-status — поллинг прогресса рассылки. */
export async function getKpJobSendStatus(
  jobId: number,
): Promise<KpJobSendStatus> {
  const r = await apiClient.get<KpJobSendStatus>(
    `/outreach/kp/jobs/${jobId}/send-status`,
  );
  return r.data;
}

/**
 * GET /outreach/kp/jobs/{id}/call-list.xlsx — качает xlsx «На обзвон»:
 * только компании партии без email, но с валидным телефоном. Каждая
 * строка содержит нормализованный номер + тип (мобильный/городской) +
 * wa.me-ссылку + pain/цитату/тему/тело — для холодного звонка или WA-
 * сообщения вручную.
 *
 * Возвращает Blob + предложенное имя файла из Content-Disposition.
 * 404 при отсутствии партии или нулевом списке — UI показывает тост.
 */
export async function downloadKpJobCallList(
  jobId: number,
): Promise<{ blob: Blob; filename: string }> {
  const r = await apiClient.get<Blob>(
    `/outreach/kp/jobs/${jobId}/call-list.xlsx`,
    { responseType: 'blob' },
  );
  const dispo = r.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(dispo);
  const filename = match?.[1] || `kp-call-list_job-${jobId}.xlsx`;
  return { blob: r.data, filename };
}

/** GET /outreach/kp/sends — для вкладки «Отправки» в /history. */
export async function listKpSends(
  params: { limit?: number; offset?: number } = {},
): Promise<KpSendListResponse> {
  const r = await apiClient.get<KpSendListResponse>('/outreach/kp/sends', {
    params: {
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  });
  return r.data;
}
