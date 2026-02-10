'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
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
            className="rounded border-gray-300 dark:border-gray-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">{f.label}</span>
          {f.description && <span className="text-xs text-gray-500">({f.description})</span>}
        </label>
      );
    }

    return (
      <div key={key} className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {f.label}
          {f.required && <span className="text-red-500"> *</span>}
        </label>
        <Input
          type={isSecret ? 'password' : 'text'}
          value={val === '***' ? '' : String(val ?? '')}
          placeholder={isSecret && val === '***' ? '••• (не менять)' : f.description}
          onChange={(e) => setField(p.id, key, e.target.value)}
          className="bg-white dark:bg-gray-700"
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
        <div className="rounded-[14px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <p className="text-gray-600 dark:text-gray-400 mb-3">Войдите для доступа к настройкам провайдеров.</p>
          <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline">
            Войти
          </Link>
        </div>
      ) : loading ? (
        <p className="text-gray-500 dark:text-gray-400">Загрузка…</p>
      ) : (
        <div className="space-y-6">
          {list.map((p) => (
            <div
              key={p.id}
              className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{p.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                      {p.type === 'free' ? 'Бесплатный' : 'Платный'}
                    </span>
                    {p.configured ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        Настроен
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                        Не настроен
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{p.description}</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {p.settings_schema.map((f) => renderField(p, f))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <Button
                  onClick={() => handleTest(p.id)}
                  disabled={!!testing[p.id]}
                  variant="outline"
                  size="sm"
                >
                  {testing[p.id] ? 'Проверка…' : 'Проверить'}
                </Button>
                <Button
                  onClick={() => handleSave(p.id)}
                  disabled={!!saving[p.id]}
                  size="sm"
                >
                  {saving[p.id] ? 'Сохранение…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
