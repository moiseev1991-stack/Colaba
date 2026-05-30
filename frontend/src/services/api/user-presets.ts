/**
 * API клиент для пользовательских пресетов фильтров.
 *
 * Бэк: /api/v1/user-presets (см. backend/app/modules/user_presets/router.py).
 * Scope: per-user — юзер видит и редактирует только свои.
 *
 * filter — произвольный JSON. Для модуля 'maps' это MapSearchFilter
 * (см. ./maps.ts), для других модулей — другие схемы.
 */

import { apiClient } from '@/client';

export type PresetModule = 'maps';

export interface UserPresetOut {
  id: number;
  user_id: number;
  module: string;
  name: string;
  description: string | null;
  filter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserPresetCreate {
  name: string;
  description?: string | null;
  module?: PresetModule;
  filter: Record<string, unknown>;
}

export interface UserPresetUpdate {
  name?: string;
  description?: string | null;
  filter?: Record<string, unknown>;
}

export async function listUserPresets(module: PresetModule = 'maps'): Promise<UserPresetOut[]> {
  const response = await apiClient.get<UserPresetOut[]>(
    `/user-presets?module=${module}`,
  );
  return response.data;
}

export async function createUserPreset(payload: UserPresetCreate): Promise<UserPresetOut> {
  const response = await apiClient.post<UserPresetOut>('/user-presets', payload);
  return response.data;
}

export async function updateUserPreset(
  id: number,
  payload: UserPresetUpdate,
): Promise<UserPresetOut> {
  const response = await apiClient.patch<UserPresetOut>(`/user-presets/${id}`, payload);
  return response.data;
}

export async function deleteUserPreset(id: number): Promise<void> {
  await apiClient.delete(`/user-presets/${id}`);
}
