/**
 * Outreach templates API client.
 * См. план: docs/планы/шаблоны-кп-seo-2026-03.md
 *
 * При ошибке API использует localStorage как fallback.
 */

import { apiClient } from '@/client';

const STORAGE_KEY = 'colaba_outreach_templates';

interface StorageData {
  templates: OutreachTemplate[];
  nextId: number;
}

export interface OutreachTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  module: string;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OutreachTemplateCreate {
  name: string;
  subject: string;
  body: string;
  module?: string;
}

function getFromLocalStorage(): OutreachTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: StorageData = JSON.parse(raw);
    return Array.isArray(parsed.templates) ? parsed.templates : [];
  } catch {
    return [];
  }
}

/** Синхронное чтение из localStorage для мгновенного отображения (без ожидания API). */
export function getOutreachTemplatesSync(): OutreachTemplate[] {
  return getFromLocalStorage();
}

function getStorageData(): StorageData {
  if (typeof window === 'undefined') return { templates: [], nextId: 1 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { templates: [], nextId: 1 };
    const parsed: StorageData = JSON.parse(raw);
    return {
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
      nextId: typeof parsed.nextId === 'number' && parsed.nextId >= 1 ? parsed.nextId : 1,
    };
  } catch {
    return { templates: [], nextId: 1 };
  }
}

function saveToLocalStorage(templates: OutreachTemplate[], nextId: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ templates, nextId }));
  } catch {
    // ignore quota exceeded etc.
  }
}

/**
 * Список шаблонов КП. При ошибке API или таймауте — данные из localStorage.
 * Сначала возвращаем localStorage (мгновенно), т.к. эндпоинт может отсутствовать в backend.
 */
export async function getOutreachTemplates(): Promise<OutreachTemplate[]> {
  const local = getFromLocalStorage();
  try {
    const response = await apiClient.get<OutreachTemplate[]>('/outreach/templates', {
      timeout: 4000,
    });
    const api = response.data ?? [];
    return api.length > 0 ? api : local;
  } catch {
    return local;
  }
}

/**
 * Создать шаблон. При ошибке API сохраняет в localStorage.
 */
export async function createOutreachTemplate(
  data: OutreachTemplateCreate
): Promise<OutreachTemplate> {
  try {
    const response = await apiClient.post<OutreachTemplate>('/outreach/templates', {
      ...data,
      module: data.module ?? 'seo',
    });
    return response.data;
  } catch {
    const { templates, nextId } = getStorageData();
    const now = new Date().toISOString();
    const newTemplate: OutreachTemplate = {
      id: nextId,
      name: data.name.trim(),
      subject: data.subject.trim(),
      body: data.body.trim(),
      module: data.module ?? 'seo',
      created_at: now,
      updated_at: now,
    };
    templates.push(newTemplate);
    saveToLocalStorage(templates, nextId + 1);
    return newTemplate;
  }
}

/**
 * Обновить шаблон. При ошибке API обновляет в localStorage.
 */
export async function updateOutreachTemplate(
  id: number,
  data: Partial<OutreachTemplateCreate>
): Promise<OutreachTemplate> {
  try {
    const response = await apiClient.patch<OutreachTemplate>(`/outreach/templates/${id}`, data);
    return response.data;
  } catch {
    const { templates, nextId } = getStorageData();
    const idx = templates.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Шаблон не найден');
    const updated: OutreachTemplate = {
      ...templates[idx],
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.subject !== undefined && { subject: data.subject.trim() }),
      ...(data.body !== undefined && { body: data.body.trim() }),
      ...(data.module !== undefined && { module: data.module }),
      updated_at: new Date().toISOString(),
    };
    templates[idx] = updated;
    saveToLocalStorage(templates, nextId);
    return updated;
  }
}

/**
 * Удалить шаблон. При ошибке API удаляет из localStorage.
 */
export async function deleteOutreachTemplate(id: number): Promise<void> {
  try {
    await apiClient.delete(`/outreach/templates/${id}`);
  } catch {
    const { templates, nextId } = getStorageData();
    const filtered = templates.filter((t) => t.id !== id);
    if (filtered.length === templates.length) throw new Error('Шаблон не найден');
    saveToLocalStorage(filtered, nextId);
  }
}

/** Плейсхолдеры для справки в форме шаблона */
export const PLACEHOLDERS = [
  { key: '{{domain}}', desc: 'Домен сайта' },
  { key: '{{issues}}', desc: 'Список SEO-проблем' },
  { key: '{{score}}', desc: 'SEO оценка (0–100)' },
  { key: '{{company_name}}', desc: 'Название компании' },
  { key: '{{title}}', desc: 'Title страницы' },
  { key: '{{url}}', desc: 'URL страницы' },
] as const;
