'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill } from '@/components/ui/SignalPill';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import { Loader2, Save, Zap, MapPin } from 'lucide-react';
import { tokenStorage } from '@/client';
import {
  getMapsProvidersSettings,
  updateMapsProvider,
  testMapsProvider,
  type MapProviderConfigDTO,
  type MapProviderId,
} from '@/src/services/api/mapsProviders';

function getErrorMessage(e: unknown, context: 'load' | 'save' | 'test'): string {
  const err = e as { response?: { status?: number; data?: { detail?: string } } };
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === 401) return 'Войдите в аккаунт';
  if (status === 403) return 'Недостаточно прав (нужен суперпользователь)';
  if (status && status >= 500) return 'Сервер недоступен';
  if (!status) return 'Сервер недоступен';
  return (
    detail ||
    (context === 'load'
      ? 'Ошибка загрузки настроек'
      : context === 'save'
        ? 'Ошибка сохранения'
        : 'Ошибка проверки')
  );
}

interface PerProviderState {
  // Локальные значения полей (api_key / secondary_key).
  form: Record<string, string>;
  is_enabled: boolean;
  saving: boolean;
  testing: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function MapsProvidersSettingsPage() {
  const [list, setList] = useState<MapProviderConfigDTO[]>([]);
  const [state, setState] = useState<Record<MapProviderId, PerProviderState>>({
    twogis: { form: {}, is_enabled: false, saving: false, testing: false },
    yandex_maps: { form: {}, is_enabled: false, saving: false, testing: false },
    google_maps: { form: {}, is_enabled: false, saving: false, testing: false },
  });
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [
      ...prev,
      { id: Date.now().toString(), type, message },
    ]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMapsProvidersSettings();
      setList(data);
      const next = { ...state };
      for (const p of data) {
        next[p.provider_id] = {
          form: {
            api_key: p.api_key ?? '',
            secondary_key: p.secondary_key ?? '',
          },
          is_enabled: p.is_enabled,
          saving: false,
          testing: false,
        };
      }
      setState(next);
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'load'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const setField = (id: MapProviderId, key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        form: { ...prev[id].form, [key]: value },
      },
    }));
  };

  const setEnabled = (id: MapProviderId, value: boolean) => {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], is_enabled: value },
    }));
  };

  const handleSave = async (p: MapProviderConfigDTO) => {
    const id = p.provider_id;
    setState((s) => ({ ...s, [id]: { ...s[id], saving: true } }));
    try {
      // Формируем payload. Для секретов: '' / '***' → null (бэк НЕ перезапишет).
      const localForm = state[id].form;
      const payload: Record<string, unknown> = {
        is_enabled: state[id].is_enabled,
      };
      for (const f of p.fields) {
        const v = localForm[f.key];
        if (v === '' || v === '***') {
          payload[f.key] = null; // backend игнорирует null для секретов
        } else {
          payload[f.key] = v;
        }
      }
      const updated = await updateMapsProvider(id, payload);
      // Перечитываем состояние после save (бэк вернёт свежие *** / is_configured).
      setList((prev) => prev.map((x) => (x.provider_id === id ? updated : x)));
      setState((s) => ({
        ...s,
        [id]: {
          ...s[id],
          form: {
            api_key: updated.api_key ?? '',
            secondary_key: updated.secondary_key ?? '',
          },
          is_enabled: updated.is_enabled,
        },
      }));
      addToast('success', `${p.name}: настройки сохранены`);
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'save'));
    } finally {
      setState((s) => ({ ...s, [id]: { ...s[id], saving: false } }));
    }
  };

  const handleTest = async (p: MapProviderConfigDTO) => {
    const id = p.provider_id;
    setState((s) => ({ ...s, [id]: { ...s[id], testing: true } }));
    try {
      const res = await testMapsProvider(id);
      if (res.ok) {
        addToast(
          'success',
          `${p.name}: проверка пройдена${
            res.result_count != null ? `, результатов: ${res.result_count}` : ''
          }`,
        );
      } else {
        addToast('error', `${p.name}: ${res.error || 'ошибка проверки'}`);
      }
      // Перечитываем — бэк записал last_test_*.
      const data = await getMapsProvidersSettings();
      setList(data);
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e, 'test'));
    } finally {
      setState((s) => ({ ...s, [id]: { ...s[id], testing: false } }));
    }
  };

  const renderField = (p: MapProviderConfigDTO, f: MapProviderConfigDTO['fields'][number]) => {
    const id = p.provider_id;
    const localVal = state[id]?.form[f.key] ?? '';
    const isSecret = f.secret;
    // Если в local лежит '***' (initial load) — показываем placeholder.
    const isMasked = localVal === '***';
    return (
      <div key={f.key} className="flex flex-col gap-1">
        <label className="text-sm font-medium" style={{ color: 'hsl(var(--text))' }}>
          {f.label}
          {f.required && <span style={{ color: 'var(--signal-hot)' }}> *</span>}
        </label>
        <Input
          type={isSecret ? 'password' : 'text'}
          value={isMasked ? '' : localVal}
          placeholder={
            isMasked
              ? '••• (не менять)'
              : f.description || 'вставьте ключ'
          }
          onChange={(e) => setField(id, f.key, e.target.value)}
        />
        {f.description && !isMasked && (
          <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
            {f.description}
          </span>
        )}
      </div>
    );
  };

  const activeCount = list.filter((p) => p.is_enabled && p.is_configured).length;
  const activeNames = list
    .filter((p) => p.is_enabled && p.is_configured)
    .map((p) => p.name)
    .join(', ');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 overflow-x-hidden">
      <ToastContainer
        toasts={toasts}
        onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
      />

      <PageHeader
        breadcrumb={[
          { label: 'Главная', href: '/' },
          { label: 'Конфигурация', href: '/settings' },
          { label: 'Провайдеры карт' },
        ]}
        title="Провайдеры карт и отзывов"
      />

      {needsAuth ? (
        <CardV2 className="p-6">
          <p className="mb-3" style={{ color: 'hsl(var(--muted))' }}>
            Войдите для доступа к настройкам провайдеров карт.
          </p>
          <Link
            href="/auth/login"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Войти
          </Link>
        </CardV2>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2
            className="h-8 w-8 animate-spin"
            style={{ color: 'hsl(var(--muted))' }}
          />
        </div>
      ) : (
        <>
          {/* Статус-баннер сверху */}
          <div
            className="mb-6 rounded-v2-sm border px-4 py-3 flex items-start gap-3"
            style={{
              background:
                activeCount > 0 ? 'var(--signal-good-bg)' : 'var(--signal-warm-bg)',
              borderColor:
                activeCount > 0 ? 'rgb(16 185 129 / 0.3)' : 'rgb(245 158 11 / 0.3)',
            }}
          >
            <MapPin
              className="h-5 w-5 shrink-0 mt-0.5"
              style={{
                color: activeCount > 0 ? 'var(--signal-good)' : 'var(--signal-warm)',
              }}
            />
            <div>
              <div className="font-medium" style={{ color: 'hsl(var(--text))' }}>
                {activeCount > 0
                  ? `Активны: ${activeNames}`
                  : 'Нет активных провайдеров'}
              </div>
              <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted))' }}>
                {activeCount > 0
                  ? 'Эти источники используются по умолчанию при создании нового поиска.'
                  : 'Включите хотя бы один провайдер (чекбоксом ниже) или оставьте как есть — будет использоваться 2GIS из env.'}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {list.map((p) => {
              const id = p.provider_id;
              return (
                <CardV2 key={id} className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2
                          className="font-display font-semibold tracking-tight text-xl"
                          style={{ color: 'hsl(var(--text))' }}
                        >
                          {p.name}
                        </h2>
                        {p.is_configured ? (
                          <SignalPill tone="good" size="sm">
                            Настроен
                          </SignalPill>
                        ) : (
                          <SignalPill tone="warm" size="sm">
                            Не настроен
                          </SignalPill>
                        )}
                        {p.last_test_result === 'ok' && (
                          <SignalPill tone="good" size="sm">
                            Проверен OK
                          </SignalPill>
                        )}
                        {p.last_test_result === 'error' && (
                          <SignalPill tone="hot" size="sm">
                            Проверка не удалась
                          </SignalPill>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted))' }}>
                          {p.description}
                        </p>
                      )}
                    </div>
                    {/* Switch is_enabled */}
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={state[id]?.is_enabled ?? false}
                        onChange={(e) => setEnabled(id, e.target.checked)}
                        className="rounded border"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      />
                      <span className="text-sm" style={{ color: 'hsl(var(--text))' }}>
                        Включён
                      </span>
                    </label>
                  </div>

                  <div className="space-y-4">
                    {p.fields.map((f) => renderField(p, f))}
                  </div>

                  {p.last_test_at && (
                    <p className="mt-3 text-xs" style={{ color: 'hsl(var(--muted))' }}>
                      Проверен {formatDate(p.last_test_at)}
                      {p.last_test_result === 'ok'
                        ? ' — OK'
                        : p.last_test_error
                          ? ` — ошибка: ${p.last_test_error}`
                          : ''}
                    </p>
                  )}

                  <div
                    className="mt-4 pt-4 border-t flex gap-3"
                    style={{ borderColor: 'hsl(var(--border))' }}
                  >
                    <ButtonV2
                      variant="secondary"
                      size="sm"
                      onClick={() => handleTest(p)}
                      loading={!!state[id]?.testing}
                      iconLeft={<Zap className="h-4 w-4" />}
                    >
                      Проверить
                    </ButtonV2>
                    <ButtonV2
                      variant="primary"
                      size="sm"
                      onClick={() => handleSave(p)}
                      loading={!!state[id]?.saving}
                      iconLeft={<Save className="h-4 w-4" />}
                    >
                      Сохранить
                    </ButtonV2>
                  </div>
                </CardV2>
              );
            })}
          </div>

          <p className="mt-6 text-xs" style={{ color: 'hsl(var(--muted))' }}>
            Ключи сохраняются в БД и приоритетнее env-переменных ({' '}
            <code className="font-mono">TWOGIS_API_KEY</code>,{' '}
            <code className="font-mono">SERPAPI_KEY</code>
            ). Если провайдер выключен, но ключ есть в env — он продолжит работать
            как раньше (обратная совместимость).
          </p>
        </>
      )}
    </div>
  );
}
