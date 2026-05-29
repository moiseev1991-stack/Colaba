/**
 * Lead lists API client.
 *
 * Связка с outreach: из листа создаётся EmailCampaign с подстановкой
 * {company_name}, {city}, {top_pain}, {pain_quote} в шаблон.
 */

import { apiClient } from '@/client';
import type { CompanyOut } from './maps';

export type LeadListSource = 'maps' | 'sites' | 'manual';

export interface LeadListOut {
  id: number;
  name: string;
  description?: string | null;
  source: string;
  items_count: number;
  created_at: string;
  updated_at: string;
}

export interface LeadListDetailOut extends LeadListOut {
  items: CompanyOut[];
}

export interface LeadListCreate {
  name: string;
  description?: string | null;
  source?: LeadListSource;
}

export interface LeadListUpdate {
  name?: string;
  description?: string | null;
}

export interface LeadListItemsAddOut {
  added: number;
  already_in_list: number;
  not_found: number;
  items_count: number;
}

export interface CreateCampaignFromListIn {
  name: string;
  subject: string;
  body: string;
  template_id?: number | null;
  domain_id?: number | null;
  from_email?: string | null;
  from_name?: string | null;
  reply_to_email?: string | null;
  auto_personalize?: boolean;
}

export interface CreateCampaignFromListOut {
  campaign_id: number;
  total_recipients: number;
  skipped_no_email: number;
}

export async function listMyLeadLists(): Promise<LeadListOut[]> {
  const response = await apiClient.get<LeadListOut[]>('/lead-lists');
  return response.data;
}

export async function createLeadList(payload: LeadListCreate): Promise<LeadListOut> {
  const response = await apiClient.post<LeadListOut>('/lead-lists', payload);
  return response.data;
}

export async function getLeadList(id: number, limit = 200, offset = 0): Promise<LeadListDetailOut> {
  const response = await apiClient.get<LeadListDetailOut>(
    `/lead-lists/${id}?limit=${limit}&offset=${offset}`
  );
  return response.data;
}

export async function updateLeadList(id: number, payload: LeadListUpdate): Promise<LeadListOut> {
  const response = await apiClient.patch<LeadListOut>(`/lead-lists/${id}`, payload);
  return response.data;
}

export async function deleteLeadList(id: number): Promise<void> {
  await apiClient.delete(`/lead-lists/${id}`);
}

export async function addLeadListItems(
  id: number,
  companyIds: number[]
): Promise<LeadListItemsAddOut> {
  const response = await apiClient.post<LeadListItemsAddOut>(`/lead-lists/${id}/items`, {
    company_ids: companyIds,
  });
  return response.data;
}

export async function removeLeadListItem(id: number, companyId: number): Promise<void> {
  await apiClient.delete(`/lead-lists/${id}/items/${companyId}`);
}

export async function createCampaignFromList(
  id: number,
  payload: CreateCampaignFromListIn
): Promise<CreateCampaignFromListOut> {
  const response = await apiClient.post<CreateCampaignFromListOut>(
    `/lead-lists/${id}/create-campaign`,
    payload
  );
  return response.data;
}

export interface BulkDraftItem {
  company_id: number;
  company_name: string;
  subject: string;
  body: string;
  used_pain_label?: string | null;
  used_pain_quote?: string | null;
  suggested_to_emails: string[];
}

export interface BulkDraftsOut {
  list_id: number;
  total_companies: number;
  drafts: BulkDraftItem[];
  skipped_no_pains: number;
  skipped_llm_error: number;
}

/** POST /lead-lists/{id}/bulk-drafts — параллельная LLM-генерация драфтов
 *  для всех компаний списка. Может занять 10-30с на 25 компаний. */
export async function bulkDraftEmails(id: number): Promise<BulkDraftsOut> {
  const response = await apiClient.post<BulkDraftsOut>(
    `/lead-lists/${id}/bulk-drafts`,
    {},
    { timeout: 120000 } // 2 мин — LLM может быть медленным
  );
  return response.data;
}
