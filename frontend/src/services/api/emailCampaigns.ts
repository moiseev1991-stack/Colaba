/**
 * Email campaigns API client.
 */

import { apiClient } from '@/client';

export interface EmailCampaign {
  id: number;
  name: string;
  subject: string;
  status: 'draft' | 'sending' | 'completed' | 'failed';
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  spam_count: number;
  failed_count: number;
  from_email?: string;
  from_name?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface EmailLog {
  id: number;
  campaign_id?: number;
  to_email: string;
  to_name?: string;
  subject: string;
  status: 'pending' | 'sent' | 'delivered' | 'bounced' | 'opened' | 'clicked' | 'spam' | 'failed';
  external_message_id?: string;
  error_message?: string;
  created_at: string;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  bounced_at?: string;
}

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  spam: number;
  failed: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

export interface CampaignsListParams {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface EmailReply {
  id: number;
  from_email: string;
  from_name: string | null;
  subject: string;
  body_text: string | null;
  campaign_id: number | null;
  is_processed: boolean;
  forwarded_to: string | null;
  received_at: string;
}

/**
 * List email campaigns.
 */
export async function listCampaigns(params: CampaignsListParams = {}): Promise<EmailCampaign[]> {
  const response = await apiClient.get<EmailCampaign[]>('/email/campaigns', { params });
  return response.data ?? [];
}

/**
 * Get a single campaign.
 */
export async function getCampaign(id: number): Promise<EmailCampaign> {
  const response = await apiClient.get<EmailCampaign>(`/email/campaigns/${id}`);
  return response.data;
}

/**
 * Get campaign statistics.
 */
export async function getCampaignStats(id: number): Promise<CampaignStats> {
  const response = await apiClient.get<CampaignStats>(`/email/campaigns/${id}/stats`);
  return response.data;
}

/**
 * Get campaign logs.
 */
export async function getCampaignLogs(
  id: number,
  params: { limit?: number; offset?: number; status?: string } = {}
): Promise<EmailLog[]> {
  const response = await apiClient.get<EmailLog[]>(`/email/campaigns/${id}/logs`, { params });
  return response.data ?? [];
}

/**
 * Get overall email statistics.
 */
export async function getEmailStats(): Promise<CampaignStats> {
  const response = await apiClient.get<CampaignStats>('/email/stats');
  return response.data;
}

/**
 * Get email replies.
 */
export async function getReplies(
  params: { limit?: number; offset?: number } = {}
): Promise<{ replies: EmailReply[]; total: number }> {
  const response = await apiClient.get<{ replies: EmailReply[]; total: number }>('/email/replies', { params });
  return response.data ?? { replies: [], total: 0 };
}

/**
 * Get a specific email reply.
 */
export async function getReply(id: number): Promise<EmailReply> {
  const response = await apiClient.get<EmailReply>(`/email/replies/${id}`);
  return response.data;
}
