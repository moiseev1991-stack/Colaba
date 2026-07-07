'use client';

// force-dynamic: страница делает API-вызовы в useEffect на клиенте,
// но Next.js пытается статически prerender'нуть её при build — без
// доступного backend'а это падает. Отключаем static-generation.
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill } from '@/components/ui/SignalPill';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import { Loader2, Save, Zap, Mail, ArrowUp, ArrowDown } from 'lucide-react';
import {
  getEmailProvidersSettings,
  updateEmailProvider,
  testEmailProvider,
  setEmailProviderPriority,
  type EmailProviderConfigDTO,
  type EmailProviderId,
} from '@/src/services/api/emailProviders';

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
  form: Record<string, string>;
  cost_per_mail: string;
  is_enabled: boolean;
  transport: 'smtp' | 'http';
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

const PRIORITY_LABELS: Record<number, string> = {
  0: 'Основной',
  1: 'Резервный',
  2: 'Дополнительный',
};

export default function EmailProvidersSettingsPage() {
  const [list, setList] = useState<EmailProviderConfigDTO[]>([]);
  const [state, setState] = useState<Record<string, PerProviderState>>({});
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEmailProvidersSettings();
      setList(data);
      const next: Record<string, PerProviderState> = {};
      for (const p of data) {
        const form: Record<string, string> = {};
        // Секреты остаются пустыми в форме (значение *** из API — как заглушка,
        // админ вводит новое или оставляет пустым = не менять).
        form.api_key = p.api_key && p.api_key !== '***' ? p.api_key : '';
        form.secret_key = p.secret_key && p.secret_key !== '***' ? p.secret_key : '';
        form.smtp_password = p.smtp_password && p.smtp_password !== '***' ? p.smtp_password : '';
        // Не-секреты — показываем текущие значения:
        form.smtp_host = p.smtp_host ?? '';
        form.smtp_port = p.smtp_port != null ? String(p.smtp_port) : '';
        form.smtp_user = p.smtp_user ?? '';
        form.from_email = p.from_email ?? '';
        form.from_name = p.from_name ?? '';
        form.region = p.region ?? '';
        next[p.provider_id] = {
          form,
          cost_per_mail: String(p.cost_per_mail ?? 0),
          is_enabled: p.is_enabled,
          transport: p.transport === 'http' ? 'http' : 'smtp',
          saving: false,
          testing: false,
        };
      }
      setState(next);
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 401) {
        setNeedsAuth(true);
      } else {
        addToast('error', getErrorMessage(e, 'load'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (id: string, key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], form: { ...prev[id].form, [key]: value } },
    }));
  };

  const setEnabled = (id: string, value: boolean) => {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], is_enabled: value } }));
  };

  const setCost = (id: string, value: string) => {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], cost_per_mail: value } }));
  };

  const setTransport = (id: string, value: 'smtp' | 'http') => {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], transport: value } }));
  };

  const save = async (id: string) => {
    const s = state[id];
    if (!s) return;
    setState((prev) => ({ ...prev, [id]: { ...prev[id], saving: true } }));
    try {
      const payload: Record<string, unknown> = {
        ...s.form,
        cost_per_mail: parseFloat(s.cost_per_mail) || 0,
        is_enabled: s.is_enabled,
        transport: s.transport,
      };
      // Пустые секреты НЕ отправляем (бэкенд оставит старые).
      if (!payload.api_key) delete payload.api_key;
      if (!payload.secret_key) delete payload.secret_key;
      if (!payload.smtp_password) delete payload.smtp_password;
      // smtp_port → number
      if (payload.smtp_port) payload.smtp_port = parseInt(String(payload.smtp_port), 10);
      const updated = await updateEmailProvider(id as EmailProviderId, payload);
      setList((prev) => prev.map((p) => (p.provider_id === id ? updated : p)));
      addToast('success', `Настройки «${updated.name}» сохранены`);
    } catch (e) {
      addToast('error', getErrorMessage(e, 'save'));
    } finally {
      setState((prev) => ({ ...prev, [id]: { ...prev[id], saving: false } }));
    }
  };

  const test = async (id: string) => {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], testing: true } }));
    try {
      const result = await testEmailProvider(id as EmailProviderId);
      if (result.ok) {
        addToast('success', 'Подключение работает ✓');
      } else {
        addToast('error', `Не получилось: ${result.error ?? 'неизвестная ошибка'}`);
      }
      // Перезагружаем чтобы обновить last_test_*
      await load();
    } catch (e) {
      addToast('error', getErrorMessage(e, 'test'));
    } finally {
      setState((prev) => ({ ...prev, [id]: { ...prev[id], testing: false } }));
    }
  };

  const changePriority = async (id: string, delta: -1 | 1) => {
    const p = list.find((x) => x.provider_id === id);
    if (!p) return;
    const newPriority = Math.max(0, Math.min(2, p.priority + delta));
    try {
      const updated = await setEmailProviderPriority(id as EmailProviderId, newPriority);
      // Перезагружаем все — приоритеты других тоже сдвинулись.
      await load();
      void updated;
    } catch (e) {
      addToast('error', getErrorMessage(e, 'save'));
    }
  };

  if (needsAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <a href="/auth/login" className="text-[hsl(var(--accent))] underline">
          Войдите в систему
        </a>
      </div>
    );
  }

  const activeCount = list.filter((p) => p.is_enabled && p.is_configured).length;
  const sortedByPriority = [...list].sort((a, b) => a.priority - b.priority);

  return (
    <div className="min-h-screen pb-20">
      <PageHeader
        breadcrumb={[
          { label: 'Главная', href: '/' },
          { label: 'Конфигурация', href: '/settings' },
          { label: 'Провайдеры email' },
        ]}
        title="Провайдеры email"
      />
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <p className="mb-6 text-sm" style={{ color: 'hsl(var(--muted))' }}>
          Каналы отправки писем с автоматическим резервом
        </p>
        {/* Статус-баннер */}
        <div
          className="mb-6 rounded-[12px] border p-4"
          style={{
            borderColor: activeCount > 0 ? 'hsl(var(--signal-good-border))' : 'hsl(var(--signal-warm-border))',
            background: activeCount > 0 ? 'hsl(var(--signal-good-bg))' : 'hsl(var(--signal-warm-bg))',
          }}
        >
          <p className="text-sm font-medium">
            {activeCount === 0 ? (
              <>Нет активных каналов — рассылка невозможна. Включите хотя бы один.</>
            ) : (
              <>
                Активны:{' '}
                {sortedByPriority
                  .filter((p) => p.is_enabled && p.is_configured)
                  .map((p) => `${p.name} (${PRIORITY_LABELS[p.priority] ?? p.priority})`)
                  .join(' → ')}
                . При сбое основного — авто-переход на следующий.
              </>
            )}
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'hsl(var(--muted))' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка настроек…
          </div>
        )}

        <div className="space-y-6">
          {sortedByPriority.map((p) => {
            const s = state[p.provider_id];
            if (!s) return null;
            const status: 'ok' | 'warn' | 'bad' = p.is_enabled
              ? p.is_configured
                ? 'ok'
                : 'warn'
              : 'bad';
            const statusLabel =
              status === 'ok' ? 'Готов к отправке' : status === 'warn' ? 'Включён, но не настроен' : 'Отключён';

            return (
              <CardV2 key={p.provider_id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]"
                      style={{ background: 'hsl(var(--accent-soft))' }}
                    >
                      <Mail className="h-5 w-5" style={{ color: 'hsl(var(--accent))' }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">{p.name}</h2>
                        <SignalPill tone={status === 'ok' ? 'good' : status === 'warn' ? 'warm' : 'muted'}>{statusLabel}</SignalPill>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted))' }}>
                        Приоритет: {PRIORITY_LABELS[p.priority] ?? p.priority}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ButtonV2
                      variant="ghost"
                      size="sm"
                      onClick={() => changePriority(p.provider_id, -1)}
                      disabled={p.priority === 0}
                      title="Повысить приоритет"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </ButtonV2>
                    <ButtonV2
                      variant="ghost"
                      size="sm"
                      onClick={() => changePriority(p.provider_id, 1)}
                      disabled={p.priority === 2}
                      title="Понизить приоритет"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </ButtonV2>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={s.is_enabled}
                        onChange={(e) => setEnabled(p.provider_id, e.target.checked)}
                        className="rounded border"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      />
                      <span className="text-sm">Включён</span>
                    </label>
                  </div>

                  {/* Переключатель транспорта для SMTP-провайдеров */}
                  {(p.provider_id === 'postbox' || p.provider_id === 'ses') && (
                    <div
                      className="mt-3 flex flex-wrap items-center gap-3 rounded-[8px] border p-3"
                      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
                    >
                      <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted))' }}>
                        Способ отправки:
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name={`transport-${p.provider_id}`}
                          checked={s.transport === 'smtp'}
                          onChange={() => setTransport(p.provider_id, 'smtp')}
                        />
                        SMTP (порт 587)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name={`transport-${p.provider_id}`}
                          checked={s.transport === 'http'}
                          onChange={() => setTransport(p.provider_id, 'http')}
                        />
                        HTTP API (порт 443, обходит блокировки)
                      </label>
                      {s.transport === 'http' && (
                        <span className="text-xs" style={{ color: 'hsl(var(--signal-good-text))' }}>
                          ✓ Рекомендуется, если хостинг блокирует SMTP-порты
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <p className="mt-4 text-sm" style={{ color: 'hsl(var(--muted))' }}>
                  {p.description}
                </p>

                <div className="mt-4 space-y-3">
                  {p.fields.map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'hsl(var(--muted))' }}>
                        {f.label}
                        {f.required && <span style={{ color: 'hsl(var(--signal-warm-text))' }}> *</span>}
                      </label>
                      <Input
                        type={f.secret ? 'password' : f.type === 'number' ? 'number' : 'text'}
                        value={s.form[f.key] ?? ''}
                        placeholder={f.default != null ? String(f.default) : ''}
                        onChange={(e) => setField(p.provider_id, f.key, e.target.value)}
                      />
                      {f.description && (
                        <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted))' }}>
                          {f.description}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Цена за письмо (общая для всех) */}
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'hsl(var(--muted))' }}>
                      Цена за письмо (₽)
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      value={s.cost_per_mail}
                      onChange={(e) => setCost(p.provider_id, e.target.value)}
                    />
                    <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted))' }}>
                      Стоимость отправки одного письма. Используется для учёта расходов в api_call_log.
                    </p>
                  </div>
                </div>

                {p.last_test_at && (
                  <p className="mt-3 text-xs" style={{ color: 'hsl(var(--muted))' }}>
                    Проверен {formatDate(p.last_test_at)} —{' '}
                    {p.last_test_result === 'ok' ? (
                      <span style={{ color: 'hsl(var(--signal-good-text))' }}>OK</span>
                    ) : (
                      <span style={{ color: 'hsl(var(--signal-warm-text))' }}>
                        ошибка: {p.last_test_error ?? 'неизвестно'}
                      </span>
                    )}
                  </p>
                )}

                <div className="mt-5 flex gap-2">
                  <ButtonV2 onClick={() => save(p.provider_id)} disabled={s.saving}>
                    {s.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Сохранить
                  </ButtonV2>
                  <ButtonV2 variant="secondary" onClick={() => test(p.provider_id)} disabled={s.testing}>
                    {s.testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Проверить
                  </ButtonV2>
                </div>
              </CardV2>
            );
          })}
        </div>
      </div>
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
