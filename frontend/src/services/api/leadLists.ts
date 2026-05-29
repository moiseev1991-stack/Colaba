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
