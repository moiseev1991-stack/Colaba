'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bot, ArrowLeft, Plus, Pencil, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import { tokenStorage } from '@/client';
import {
  listAiAssistants,
  getAiAssistantsRegistry,
  createAiAssistant,
  updateAiAssistant,
  deleteAiAssistant,
  type AiAssistantItem,
  type RegistryEntry,
  type SettingsSchemaField,
} from '@/src/services/api/ai_assistants';

function getErrorMessage(e: unknown, ctx: string): string {
  const err = e as { response?: { status?: number; data?: { detail?: string } } };
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === 401) return 'Войдите в аккаунт';
  if (status === 403) return 'Недостаточно прав';
  if (status === 409) return 'Используется в обходе капчи';
  if (status && status >= 500) return 'Сервер недоступен';
  if (!status) return 'Сервер недоступен';
  return detail || `Ошибка ${ctx}`;
}

export default function AiAssistantsPage() {
  const [list, setList] = useState<AiAssistantItem[]>([]);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<{
    name: string;
    provider_type: string;
    model: string;
    config: Record<string, unknown>;
    supports_vision: boolean;
    is_default: boolean;
  }>({
    name: '',
    provider_type: '',
    model: '',
    config: {},
    supports_vision: false,
    is_default: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [data, reg] = await Promise.all([listAiAssistants(), getAiAssistantsRegistry()]);
      setList(data);
      setRegistry(reg);
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'загрузки'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tokenStorage.getAccessToken()) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    load();
  }, []);

  const currentSchema = (): SettingsSchemaField[] => {
    const e = registry.find((r) => r.provider_type === form.provider_type);
    return e?.settings_schema || [];
  };

  const openCreate = () => {
    const first = registry[0];
    const pt = first?.provider_type || '';
    const ex = registry.find((r) => r.provider_type === pt)?.model_examples || [];
    setForm({
      name: '',
      provider_type: pt,
      model: ex[0] || '',
      config: {},
      supports_vision: false,
      is_default: false,
    });
    setEditId(null);
    setModal('create');
  };

  const openEdit = (a: AiAssistantItem) => {
    setForm({
      name: a.name,
      provider_type: a.provider_type,
      model: a.model,
      config: { ...a.config },
      supports_vision: a.supports_vision,
      is_default: a.is_default,
    });
    setEditId(a.id);
    setModal('edit');
  };

  const setFormField = (k: string, v: unknown) => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const setConfigField = (key: string, value: unknown) => {
    setForm((p) => ({ ...p, config: { ...p.config, [key]: value } }));
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.provider_type || !form.model.trim()) {
      addToast('error', 'Заполните название, тип провайдера и модель');
      return;
    }
    setSubmitting(true);
    try {
      await createAiAssistant({
        name: form.name.trim(),
        provider_type: form.provider_type,
        model: form.model.trim(),
        config: form.config,
        supports_vision: form.supports_vision,
        is_default: form.is_default,
      });
      addToast('success', 'AI-ассистент создан');
      setModal(null);
      load();
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'создания'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (editId == null || !form.name.trim() || !form.provider_type || !form.model.trim()) return;
    const config: Record<string, unknown> = {};
    for (const f of currentSchema()) {
      const v = form.config[f.key];
      if (f.secret && (v === '' || v === '***' || v == null)) continue;
      config[f.key] = v == null ? '' : String(v);
    }
    setSubmitting(true);
    try {
      await updateAiAssistant(editId, {
        name: form.name.trim(),
        provider_type: form.provider_type,
        model: form.model.trim(),
        config,
        supports_vision: form.supports_vision,
        is_default: form.is_default,
      });
      addToast('success', 'Изменения сохранены');
      setModal(null);
      load();
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'сохранения'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить этого AI-ассистента?')) return;
    try {
      await deleteAiAssistant(id);
      addToast('success', 'Удалено');
      load();
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'удаления'));
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await updateAiAssistant(id, { is_default: true });
      addToast('success', 'Установлено по умолчанию');
      load();
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'установки по умолчанию'));
    }
  };

  const renderConfigFields = () => {
    return currentSchema().map((f) => {
      const val = form.config[f.key];
      const isSecret = f.secret === true;
      return (
        <div key={f.key} className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {f.label}
            {f.required && <span className="text-red-500"> *</span>}
          </label>
          <Input
            type={isSecret ? 'password' : 'text'}
            value={val === '***' ? '' : String(val ?? '')}
            placeholder={isSecret && val === '***' ? '••• (не менять)' : f.description}
            onChange={(e) => setConfigField(f.key, e.target.value)}
            className="bg-white dark:bg-gray-700"
          />
        </div>
      );
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/settings" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <Bot className="h-8 w-8 text-gray-700 dark:text-gray-300" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI-ассистенты</h1>
          </div>
        </div>
        {!needsAuth && !loading && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        )}
      </div>

      {needsAuth ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <p className="text-gray-600 dark:text-gray-400 mb-3">Войдите для доступа к настройкам AI-ассистентов.</p>
          <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline">
            Войти
          </Link>
        </div>
      ) : loading ? (
        <p className="text-gray-500 dark:text-gray-400">Загрузка…</p>
      ) : (
        <div className="space-y-4">
          {list.map((a) => (
            <div
              key={a.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{a.name}</h2>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                    {a.provider_type}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{a.model}</span>
                  {a.supports_vision && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                      Vision
                    </span>
                  )}
                  {a.is_default && (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      По умолчанию
                    </span>
                  )}
                  {a.config?.api_key ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      Настроен
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {!a.is_default && (
                    <Button variant="outline" size="sm" onClick={() => handleSetDefault(a.id)} title="Сделать по умолчанию">
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(a.id)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Create / Edit */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !submitting && setModal(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {modal === 'create' ? 'Добавить AI-ассистент' : 'Изменить'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Тип провайдера *</label>
                <select
                  value={form.provider_type}
                  onChange={(e) => {
                    const pt = e.target.value;
                    const ent = registry.find((r) => r.provider_type === pt);
                    setForm((p) => ({
                      ...p,
                      provider_type: pt,
                      model: ent?.model_examples?.[0] || p.model,
                      config: {},
                    }));
                  }}
                  className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                >
                  {registry.map((r) => (
                    <option key={r.provider_type} value={r.provider_type}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Название *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setFormField('name', e.target.value)}
                  className="mt-1 bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Модель *</label>
                <Input
                  value={form.model}
                  onChange={(e) => setFormField('model', e.target.value)}
                  placeholder={registry.find((r) => r.provider_type === form.provider_type)?.model_examples?.[0]}
                  className="mt-1 bg-white dark:bg-gray-700"
                />
              </div>
              {renderConfigFields()}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.supports_vision}
                  onChange={(e) => setFormField('supports_vision', e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Поддержка Vision</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setFormField('is_default', e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">По умолчанию</span>
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <Button onClick={modal === 'create' ? handleCreate : handleUpdate} disabled={submitting}>
                {submitting ? 'Сохранение…' : 'Сохранить'}
              </Button>
              <Button variant="outline" onClick={() => setModal(null)} disabled={submitting}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
