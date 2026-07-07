/**
 * Email Providers Settings API: 3 канала отправки (Postbox/SES/Hyvor)
 * с fallback и ценой за письмо. Управляются через /app/settings/email-providers.
 *
 * Контракт совпадает с backend providers_router.py.
 */

import { apiClient } from '@/client';

export type EmailProviderId = 'postbox' | 'ses' | 'hyvor';

export interface EmailProviderField {
  key: string;
  label: string;
  type: 'text' | 'secret' | 'number';
  secret: boolean;
  required?: boolean;
  default?: string | number;
  description?: string;
}

export interface EmailProviderConfigDTO {
  provider_id: EmailProviderId;
  name: string;
  description: string;
  fields: EmailProviderField[];
  // Значения полей (секреты маскируются как '***'):
  api_key: string | null;
  secret_key: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_use_ssl: boolean;
  transport: 'smtp' | 'http';
  from_email: string | null;
  from_name: string | null;
  region: string | null;
  // Стоимость и статус:
  cost_per_mail: number;
  is_enabled: boolean;
  is_configured: boolean;
  priority: number; // 0=primary, 1=fallback, 2=tertiary
  last_test_at: string | null;
  last_test_result: string | null;
  last_test_error: string | null;
}

export type EmailProviderStatus = 'ok' | 'no_credentials' | 'disabled';

export interface EmailProviderUpdate {
  api_key?: string | null;
  secret_key?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_password?: string | null;
  smtp_use_ssl?: boolean;
  transport?: 'smtp' | 'http';
  from_email?: string | null;
  from_name?: string | null;
  region?: string | null;
  cost_per_mail?: number;
  is_enabled?: boolean;
  priority?: number;
  notes?: string | null;
}

export interface EmailProviderTestResult {
  ok: boolean;
  error: string | null;
}

export async function getEmailProvidersSettings(): Promise<EmailProviderConfigDTO[]> {
  const r = await apiClient.get<EmailProviderConfigDTO[]>('/email/providers-settings');
  return r.data;
}

export async function updateEmailProvider(
  providerId: EmailProviderId,
  payload: EmailProviderUpdate,
): Promise<EmailProviderConfigDTO> {
  const r = await apiClient.put<EmailProviderConfigDTO>(
    `/email/providers-settings/${providerId}`,
    payload,
  );
  return r.data;
}

export async function setEmailProviderPriority(
  providerId: EmailProviderId,
  priority: number,
): Promise<EmailProviderConfigDTO> {
  const r = await apiClient.put<EmailProviderConfigDTO>(
    `/email/providers-settings/${providerId}/priority`,
    { priority },
  );
  return r.data;
}

export async function testEmailProvider(
  providerId: EmailProviderId,
): Promise<EmailProviderTestResult> {
  const r = await apiClient.post<EmailProviderTestResult>(
    `/email/providers-settings/${providerId}/test`,
  );
  return r.data;
}

export async function getEmailProvidersStatus(): Promise<
  Record<EmailProviderId, EmailProviderStatus>
> {
  const r = await apiClient.get<Record<EmailProviderId, EmailProviderStatus>>(
    '/email/providers-settings/status',
  );
  return r.data;
}
