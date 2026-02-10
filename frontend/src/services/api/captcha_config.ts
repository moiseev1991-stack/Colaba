/**
 * Captcha bypass config API client.
 */

import { apiClient } from '@/client';

export interface CaptchaConfig {
  ai_assistant_id: number | null;
  external_services: {
    '2captcha'?: { enabled?: boolean; api_key?: string };
    anticaptcha?: { enabled?: boolean; api_key?: string };
  };
  updated_at?: string | null;
}

export async function getCaptchaConfig(): Promise<CaptchaConfig> {
  const r = await apiClient.get<CaptchaConfig>('/captcha-config');
  return r.data;
}

export interface CaptchaConfigUpdateBody {
  ai_assistant_id?: number | null;
  external_services?: {
    '2captcha'?: { enabled?: boolean; api_key?: string };
    anticaptcha?: { enabled?: boolean; api_key?: string };
  };
}

export async function updateCaptchaConfig(body: CaptchaConfigUpdateBody): Promise<CaptchaConfig> {
  const r = await apiClient.put<CaptchaConfig>('/captcha-config', body);
  return r.data;
}

export async function test2Captcha(apiKey?: string): Promise<{ ok: boolean; balance?: string; error?: string }> {
  const r = await apiClient.post<{ ok: boolean; balance?: string; error?: string }>('/captcha-config/test-2captcha', {
    api_key: apiKey || null,
  });
  return r.data;
}

export async function testAi(aiAssistantId?: number): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const r = await apiClient.post<{ ok: boolean; reply?: string; error?: string }>('/captcha-config/test-ai', {
    ai_assistant_id: aiAssistantId ?? null,
  });
  return r.data;
}
