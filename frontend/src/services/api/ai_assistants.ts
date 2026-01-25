/**
 * AI Assistants API client.
 */

import { apiClient } from '@/client';

export interface SettingsSchemaField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  secret: boolean;
  description?: string;
}

export interface AiAssistantItem {
  id: number;
  name: string;
  provider_type: string;
  model: string;
  config: Record<string, unknown>;
  supports_vision: boolean;
  is_default: boolean;
  updated_at: string | null;
}

export interface RegistryEntry {
  provider_type: string;
  name: string;
  config_keys: string[];
  model_examples: string[];
  settings_schema: SettingsSchemaField[];
}

export async function listAiAssistants(): Promise<AiAssistantItem[]> {
  const r = await apiClient.get<AiAssistantItem[]>('/ai-assistants');
  return r.data;
}

export async function getAiAssistantsRegistry(): Promise<RegistryEntry[]> {
  const r = await apiClient.get<RegistryEntry[]>('/ai-assistants/registry');
  return r.data;
}

export async function getAiAssistant(id: number): Promise<AiAssistantItem> {
  const r = await apiClient.get<AiAssistantItem>(`/ai-assistants/${id}`);
  return r.data;
}

export interface AiAssistantCreateBody {
  name: string;
  provider_type: string;
  model: string;
  config: Record<string, unknown>;
  supports_vision?: boolean;
  is_default?: boolean;
}

export async function createAiAssistant(body: AiAssistantCreateBody): Promise<AiAssistantItem> {
  const r = await apiClient.post<AiAssistantItem>('/ai-assistants', body);
  return r.data;
}

export interface AiAssistantUpdateBody {
  name?: string;
  provider_type?: string;
  model?: string;
  config?: Record<string, unknown>;
  supports_vision?: boolean;
  is_default?: boolean;
}

export async function updateAiAssistant(id: number, body: AiAssistantUpdateBody): Promise<AiAssistantItem> {
  const r = await apiClient.put<AiAssistantItem>(`/ai-assistants/${id}`, body);
  return r.data;
}

export async function deleteAiAssistant(id: number): Promise<void> {
  await apiClient.delete(`/ai-assistants/${id}`);
}
