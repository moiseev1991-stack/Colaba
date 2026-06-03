'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill } from '@/components/ui/SignalPill';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import { tokenStorage } from '@/client';
import {
  listProviders,
  updateProvider,
  testProvider,
  type ProviderItem,
  type SettingsSchemaField,
} from '@/src/services/api/providers';

function getErrorMessage(e: unknown, context: 'load' | 'save' | 'test'): string {
  const err = e as { response?: { status?: number; data?: { detail?: string } } };
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === 401) return 'Войдите в аккаунт';
  if (status === 403) return 'Недостаточно прав';
  if (status && status >= 500) return 'Сервер недоступен';
  if (!status) return 'Сервер недоступен';
  return (
    detail ||
    (context === 'load' ? 'Ошибка загрузки провайдеров' : context === 'save' ? 'Ошибка сохранения' : 'Ошибка проверки')
  );
}

export default function ProvidersPage() {
  const [list, setList] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };
  const [formValues, setFormValues] = useState<Record<string, Record<string, unknown>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProviders();
      setList(data);
      const next: Record<string, Record<string, unknown>> = {};
      data.forEach((p) => {
        next[p.id] = { ...p.config };
      });
      setFormValues(next);
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'load'));
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

  const setField = (providerId: string, key: string, value: unknown) => {
    setFormValues((prev) => ({
      ...prev,
      [providerId]: { ...(prev[providerId] || {}), [key]: value },
    }));
  };

  const handleSave = async (id: string) => {
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const raw = formValues[id] || {};
      const config: Record<string, unknown> = {};
      const provider = list.find((p) => p.id === id);
      if (!provider) return;
      for (const f of provider.settings_schema) {
        const v = raw[f.key];
        if (f.secret && (v === '' || v === '***' || v == null)) continue;
        if (f.type === 'bool') {
          config[f.key] = v === true || v === 'true' || v === 1;
        } else {
          config[f.key] = v == null ? '' : String(v);
        }
      }
      await updateProvider(id, config);
      addToast('success', 'Настройки сохранены');
      load();
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'save'));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const handleTest = async (id: string) => {
    setTesting((s) => ({ ...s, [id]: true }));
    try {
      const formCfg = formValues[id];
      const res = await testProvider(id, 'кофе москва', formCfg);
      if (res.ok) {
        addToast('success', `Проверка: получено результатов: ${res.result_count ?? 0}`);
      } else {
        addToast('error', res.error || 'Ошибка проверки');
      }
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'test'));
    } finally {
      setTesting((s) => ({ ...s, [id]: false }));
    }
  };

  const renderField = (p: ProviderItem, f: SettingsSchemaField) => {
    const key = f.key;
    const val = formValues[p.id]?.[key];
    const isSecret = f.secret === true;
    const isBool = f.type === 'bool';

    if (isBool) {
      const checked = val === true || val === 'true' || val === 1;
      return (
        <label key={key} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!checked}
            onChange={(e) => setField(p.id, key, e.target.checked)}
            className="rounded border"
            style={{ borderColor: 'hsl(var(--border))' }}
          />
          <span className="text-sm" style={{ color: 'hsl(var(--text))' }}>{f.label}</span>
          {f.description && (
            <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>({f.description})</span>
          )}
        </label>
      );
    }

    return (
      <div key={key} className="flex flex-col gap-1">
        <label className="text-sm font-medium" style={{ color: 'hsl(var(--text))' }}>
          {f.label}
          {f.required && <span style={{ color: 'var(--signal-hot)' }}> *</span>}
        </label>
        <Input
          type={isSecret ? 'password' : 'text'}
          value={val === '***' ? '' : String(val ?? '')}
          placeholder={isSecret && val === '***' ? '••• (не менять)' : f.description}
          onChange={(e) => setField(p.id, key, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 overflow-x-hidden">
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      <PageHeader
        breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Конфигурация', href: '/settings' }, { label: 'Провайдеры' }]}
        title="Провайдеры поиска"
      />

      {needsAuth ? (
        <CardV2 className="p-6">
          <p className="mb-3" style={{ color: 'hsl(var(--muted))' }}>
            Войдите для доступа к настройкам провайдеров.
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
        <div className="space-y-6">
          {list.map((p) => (
            <CardV2 key={p.id} className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2
                      className="font-display font-semibold tracking-tight text-xl"
                      style={{ color: 'hsl(var(--text))' }}
                    >
                      {p.name}
                    </h2>
                    <SignalPill tone="muted" size="sm">
                      {p.type === 'free' ? 'Бесплатный' : 'Платный'}
                    </SignalPill>
                    {p.configured ? (
                      <SignalPill tone="good" size="sm">Настроен</SignalPill>
                    ) : (
                      <SignalPill tone="warm" size="sm">Не настроен</SignalPill>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted))' }}>{p.description}</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {p.settings_schema.map((f) => renderField(p, f))}
              </div>

              <div
                className="mt-4 pt-4 border-t flex gap-3"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <ButtonV2
                  variant="secondary"
                  size="sm"
                  onClick={() => handleTest(p.id)}
                  loading={!!testing[p.id]}
                >
                  Проверить
                </ButtonV2>
                <ButtonV2
                  variant="primary"
                  size="sm"
                  onClick={() => handleSave(p.id)}
                  loading={!!saving[p.id]}
                >
                  Сохранить
                </ButtonV2>
              </div>
            </CardV2>
          ))}
        </div>
      )}
    </div>
  );
}
