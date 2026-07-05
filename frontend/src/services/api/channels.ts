/**
 * Channels Settings API: настройки каналов рассылки (Telegram/WhatsApp/MAX).
 * Endpoint'ы бэкенда: /outreach/channels-settings/*.
 *
 * Контракт совпадает с backend channels_router.py. Конфиги гибкие — разные
 * поля под разные каналы (telegram: bot_token/username/welcome/cost;
 * whatsapp: api_url/instance_id/api_token/cost; max: cost).
 */

import { apiClient } from '@/client';

export type ChannelId = 'telegram' | 'whatsapp' | 'max';

export interface ChannelField {
  key: string;
  label: string;
  type: 'text' | 'secret' | 'number';
  secret?: boolean;
  required?: boolean;
  default?: string | number;
  description?: string;
}

export interface ChannelConfigDTO {
  channel_id: ChannelId;
  name: string;
  description: string;
  fields: ChannelField[];
  // Гибкий конфиг: разные поля под разные каналы. Секреты маскируются '***'.
  config: Record<string, string | number | null>;
  enabled: boolean;
  is_configured: boolean;
  last_test_at: string | null;
  last_test_result: string | null;
  last_test_error: string | null;
}

export type ChannelStatus = 'ok' | 'no_credentials' | 'disabled';

export interface ChannelConfigUpdate {
  config?: Record<string, string | number | null>;
  enabled?: boolean;
}

export interface ChannelTestResult {
  ok: boolean;
  error: string | null;
}

export async function getChannelsSettings(): Promise<ChannelConfigDTO[]> {
  const r = await apiClient.get<ChannelConfigDTO[]>('/outreach/channels-settings');
  return r.data;
}

export async function updateChannel(
  channelId: ChannelId,
  payload: ChannelConfigUpdate,
): Promise<ChannelConfigDTO> {
  const r = await apiClient.put<ChannelConfigDTO>(
    `/outreach/channels-settings/${channelId}`,
    payload,
  );
  return r.data;
}

export async function testChannel(channelId: ChannelId): Promise<ChannelTestResult> {
  const r = await apiClient.post<ChannelTestResult>(
    `/outreach/channels-settings/${channelId}/test`,
  );
  return r.data;
}

export async function getChannelsStatus(): Promise<Record<ChannelId, ChannelStatus>> {
  const r = await apiClient.get<Record<ChannelId, ChannelStatus>>(
    '/outreach/channels-settings/status',
  );
  return r.data;
}

// ── Telegram webhook setup ────────────────────────────────────────

export async function setupTelegramWebhook(publicUrl: string): Promise<{
  setup_result: Record<string, unknown>;
  webhook_url: string;
}> {
  const r = await apiClient.post('/outreach/setup-webhook', { public_url: publicUrl });
  return r.data;
}

export async function deleteTelegramWebhook(): Promise<Record<string, unknown>> {
  const r = await apiClient.post('/outreach/delete-webhook');
  return r.data;
}
