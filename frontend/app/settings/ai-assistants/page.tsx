'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Star } from 'lucide-react';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill } from '@/components/ui/SignalPill';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import { Dialog } from '@/components/ui/dialog';
import { tokenStorage } from '@/client';
import { PageHeader } from '@/components/PageHeader';
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

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tokenStorage.getAccessToken()) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    load();
  }, [load]);

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
          <label className="text-sm font-medium" style={{ color: 'hsl(var(--text))' }}>
            {f.label}
            {f.required && <span style={{ color: 'var(--signal-hot)' }}> *</span>}
          </label>
          <Input
            type={isSecret ? 'password' : 'text'}
            value={val === '***' ? '' : String(val ?? '')}
            placeholder={isSecret && val === '***' ? '••• (не менять)' : f.description}
            onChange={(e) => setConfigField(f.key, e.target.value)}
          />
        </div>
      );
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 overflow-x-hidden">
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      <PageHeader
        breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Конфигурация', href: '/settings' }, { label: 'AI-ассистенты' }]}
        title="AI-ассистенты"
        actions={!needsAuth && !loading ? (
          <ButtonV2 variant="primary" size="sm" onClick={openCreate} iconLeft={<Plus />}>
            Добавить
          </ButtonV2>
        ) : undefined}
      />

      {needsAuth ? (
        <CardV2 className="p-6">
          <p className="mb-3" style={{ color: 'hsl(var(--muted))' }}>
            Войдите для доступа к настройкам AI-ассистентов.
          </p>
          <Link
            href="/auth/login"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Войти
          </Link>
        </CardV2>
      ) : loading ? (
        <p style={{ color: 'hsl(var(--muted))' }}>Загрузка…</p>
      ) : (
        <div className="space-y-4">
          {list.map((a) => (
            <CardV2 key={a.id} className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    className="font-display font-semibold tracking-tight text-xl"
                    style={{ color: 'hsl(var(--text))' }}
                  >
                    {a.name}
                  </h2>
                  <SignalPill tone="muted" size="sm">{a.provider_type}</SignalPill>
                  <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>{a.model}</span>
                  {a.supports_vision && <SignalPill tone="accent" size="sm">Vision</SignalPill>}
                  {a.is_default && <SignalPill tone="warm" size="sm">По умолчанию</SignalPill>}
                  {a.config?.api_key ? <SignalPill tone="good" size="sm">Настроен</SignalPill> : null}
                </div>
                <div className="flex gap-2">
                  {!a.is_default && (
                    <ButtonV2
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSetDefault(a.id)}
                      title="Сделать по умолчанию"
                      iconLeft={<Star />}
                    >
                      <span className="sr-only">По умолчанию</span>
                    </ButtonV2>
                  )}
                  <ButtonV2
                    variant="secondary"
                    size="sm"
                    onClick={() => openEdit(a)}
                    iconLeft={<Pencil />}
                  >
                    <span className="sr-only">Редактировать</span>
                  </ButtonV2>
                  <ButtonV2
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(a.id)}
                    iconLeft={<Trash2 />}
                  >
                    <span className="sr-only">Удалить</span>
                  </ButtonV2>
                </div>
              </div>
            </CardV2>
          ))}
        </div>
      )}

      {/* Modal Create / Edit — теперь использует общий Dialog primitive */}
      <Dialog
        open={!!modal}
        onClose={() => !submitting && setModal(null)}
        title={modal === 'create' ? 'Добавить AI-ассистент' : 'Изменить'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" style={{ color: 'hsl(var(--text))' }}>
              Тип провайдера <span style={{ color: 'var(--signal-hot)' }}>*</span>
            </label>
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
              className="mt-1 w-full rounded-v2-sm border px-3 py-2"
              style={{
                background: 'hsl(var(--surface))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--text))',
              }}
            >
              {registry.map((r) => (
                <option key={r.provider_type} value={r.provider_type}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium" style={{ color: 'hsl(var(--text))' }}>
              Название <span style={{ color: 'var(--signal-hot)' }}>*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => setFormField('name', e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium" style={{ color: 'hsl(var(--text))' }}>
              Модель <span style={{ color: 'var(--signal-hot)' }}>*</span>
            </label>
            <Input
              value={form.model}
              onChange={(e) => setFormField('model', e.target.value)}
              placeholder={registry.find((r) => r.provider_type === form.provider_type)?.model_examples?.[0]}
              className="mt-1"
            />
          </div>
          {renderConfigFields()}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.supports_vision}
              onChange={(e) => setFormField('supports_vision', e.target.checked)}
              className="rounded border"
              style={{ borderColor: 'hsl(var(--border))' }}
            />
            <span className="text-sm" style={{ color: 'hsl(var(--text))' }}>Поддержка Vision</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setFormField('is_default', e.target.checked)}
              className="rounded border"
              style={{ borderColor: 'hsl(var(--border))' }}
            />
            <span className="text-sm" style={{ color: 'hsl(var(--text))' }}>По умолчанию</span>
          </label>
        </div>
        <div className="mt-6 flex gap-3">
          <ButtonV2
            variant="primary"
            size="md"
            onClick={modal === 'create' ? handleCreate : handleUpdate}
            loading={submitting}
          >
            Сохранить
          </ButtonV2>
          <ButtonV2
            variant="secondary"
            size="md"
            onClick={() => setModal(null)}
            disabled={submitting}
          >
            Отмена
          </ButtonV2>
        </div>
      </Dialog>
    </div>
  );
}
