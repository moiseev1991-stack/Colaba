/**
 * Email Threads API — мессенджер переписки с клиентами.
 *
 * Тред = диалог с одним контактом. Объединяет исходящие КП и входящие
 * ответы. Контракт совпадает с backend threads_router.py.
 */

import { apiClient } from '@/client';

export interface ThreadMessage {
  id: number;
  direction: 'outgoing' | 'incoming';
  subject?: string;
  body?: string;
  timestamp?: string;
  status?: string;
  message_id?: string;
}

export interface ThreadListItem {
  id: number;
  contact_email: string;
  contact_name?: string;
  subject?: string;
  last_message_at?: string;
  last_message_preview?: string;
  last_message_direction?: string;
  unread_count: number;
  is_archived: boolean;
}

export interface ThreadDetail {
  id: number;
  contact_email: string;
  contact_name?: string;
  subject?: string;
  is_archived: boolean;
  messages: ThreadMessage[];
}

export async function getThreads(params?: {
  archived?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ThreadListItem[]> {
  const r = await apiClient.get<ThreadListItem[]>('/email/threads', { params });
  return r.data;
}

export async function getThread(id: number): Promise<ThreadDetail> {
  const r = await apiClient.get<ThreadDetail>(`/email/threads/${id}`);
  return r.data;
}

export async function sendThreadMessage(threadId: number, body: string): Promise<ThreadMessage> {
  const r = await apiClient.post<ThreadMessage>(`/email/threads/${threadId}/messages`, { body });
  return r.data;
}

export async function markThreadRead(threadId: number): Promise<void> {
  await apiClient.patch(`/email/threads/${threadId}/read`);
}

export async function archiveThread(threadId: number): Promise<void> {
  await apiClient.patch(`/email/threads/${threadId}/archive`);
}
