import { apiClient } from '@/client';

export interface EmailSettingsDTO {
  provider_type: string;
  hyvor_api_url: string | null;
  hyvor_api_key: string;
  hyvor_webhook_secret: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string;
  smtp_use_ssl: boolean;
  smtp_from_email: string | null;
  smtp_from_name: string | null;
  reply_to_email: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_password: string;
  imap_use_ssl: boolean;
  imap_mailbox: string;
  reply_prefix: string;
  /**
   * Подпись для подвала КП-писем (markdown/HTML). Пусто → подвал
   * не рендерится. Бэк: миграция 039 / email_config.sender_signature_html.
   */
  sender_signature_html: string;
  /** URL логотипа для шапки КП-писем. Пусто → шапка скрыта. */
  sender_logo_url: string;
  /** Hex-цвет brand-полосы под шапкой (#RRGGBB). Пусто → дефолт. */
  sender_brand_color: string;
  is_configured: boolean;
  last_test_at: string | null;
  last_test_result: string | null;
}

export type EmailSettingsUpdate = Partial<
  Omit<EmailSettingsDTO, 'last_test_at' | 'last_test_result' | 'is_configured'>
>;

export async function getEmailSettings(): Promise<EmailSettingsDTO> {
  const response = await apiClient.get<EmailSettingsDTO>('/email/settings');
  return response.data;
}

export async function updateEmailSettings(data: EmailSettingsUpdate): Promise<EmailSettingsDTO> {
  const response = await apiClient.put<EmailSettingsDTO>('/email/settings', data);
  return response.data;
}

export async function testSmtpConnection(test_email: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post<{ success: boolean; message: string }>(
    '/email/settings/test-smtp',
    { test_email }
  );
  return response.data;
}

export async function testHyvorConnection(): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post<{ success: boolean; message: string }>(
    '/email/settings/test-hyvor',
    {}
  );
  return response.data;
}

export async function getEmailStatus(): Promise<{ configured: boolean; provider: string }> {
  const response = await apiClient.get<{ configured: boolean; provider: string }>('/email/settings/status');
  return response.data;
}
