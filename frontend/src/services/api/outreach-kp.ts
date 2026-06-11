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
  sender_profile: string;
  offer_hint: string;
  tone: string;
  template_key: string;
}

export interface KpDraft {
  id: number;
  company_id: number;
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
  company_id: number;
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
