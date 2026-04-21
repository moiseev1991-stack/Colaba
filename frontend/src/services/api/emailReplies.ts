/**
 * Email replies API client
 */

import { apiClient } from '@/client';

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
 * Get email replies
 */
export async function getReplies(
  params: { limit?: number; offset?: number } = {}
): Promise<{ replies: EmailReply[]; total: number }> {
  const response = await apiClient.get<{ replies: EmailReply[]; total: number }>('/email/replies', { params });
  return response.data ?? { replies: [], total: 0 };
}

/**
 * Get a specific email reply
 */
export async function getReply(id: number): Promise<EmailReply> {
  const response = await apiClient.get<EmailReply>(`/email/replies/${id}`);
  return response.data;
}
