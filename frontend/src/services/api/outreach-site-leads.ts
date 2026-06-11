/**
 * API клиент для site-leads (Эпик F фокус-релиза «КП-конвейер»).
 *
 * Эндпоинты: /outreach/site-leads/* (см. backend kp_router.py + site_leads_router.py).
 *
 * Поток UX:
 *   1. Юзер на вкладке «Сайты» делает web-search через /api/v1/searches
 *      (existing modules/searches).
 *   2. На карточке результата кликает «Сохранить как лид» или сразу «КП».
 *   3. Frontend POST /outreach/site-leads → получает SiteLead.id.
 *   4. KpModal открывается с siteLeadId → POST /outreach/kp/generate
 *      с {site_lead_id, template_key, tone}.
 */

import { apiClient } from '@/client';

export interface SiteLead {
  id: number;
  user_id: number;
  search_id: number | null;
  query: string;
  entry: string;
  url: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  created_at: string;
}

export interface SiteLeadCreate {
  query: string;
  entry?: string;
  url: string;
  title?: string | null;
  snippet?: string | null;
  search_id?: number | null;
}

export async function createSiteLead(payload: SiteLeadCreate): Promise<SiteLead> {
  const r = await apiClient.post<SiteLead>('/outreach/site-leads', payload);
  return r.data;
}

export async function listSiteLeads(): Promise<SiteLead[]> {
  const r = await apiClient.get<SiteLead[]>('/outreach/site-leads');
  return r.data;
}

export async function deleteSiteLead(leadId: number): Promise<void> {
  await apiClient.delete(`/outreach/site-leads/${leadId}`);
}
