'use client';

// force-dynamic: страница делает API-вызовы в useEffect на клиенте.
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill } from '@/components/ui/SignalPill';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import { Loader2, Save, Zap, Send, MessageCircle, Mail, AlertCircle } from 'lucide-react';
import {
  getChannelsSettings,
  updateChannel,
  testChannel,
  type ChannelConfigDTO,
  type ChannelId,
} from '@/src/services/api/channels';

function getErrorMessage(e: unknown, context: 'load' | 'save' | 'test'): string {
  const err = e as { response?: { status?: number; data?: { detail?: string } } };
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === 401) return 'Войдите в аккаунт';
  if (status === 403) return 'Недостаточно прав (нужен суперпользователь)';
  if (status && status >= 500) return 'Сервер недоступен';
  if (!status) return 'Сервер недоступен';
  return detail || (context === 'load' ? 'Ошибка загрузки' : context === 'save' ? 'Ошибка сохранения' : 'Ошибка проверки');
}

interface PerChannelState {
  config: Record<string, string>;
  enabled: boolean;
  saving: boolean;
  testing: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const CHANNEL_ICON: Record<string, typeof Send> = {
  telegram: Send,
  whatsapp: MessageCircle,
  max: MessageCircle,
};

export default function ChannelsSettingsPage() {
  const [list, setList] = useState<ChannelConfigDTO[]>([]);
  const [state, setState] = useState<Record<string, PerChannelState>>({});
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getChannelsSettings();
      setList(data);
      const next: Record<string, PerChannelState> = {};
      for (const ch of data) {
        const config: Record<string, string> = {};
        for (const [k, v] of Object.entries(ch.config || {})) {
          // Секреты остаются пустыми в форме (*** = заглушка, адмен вводит новое).
          config[k] = v === '***' ? '' : String(v ?? '');
        }
        next[ch.channel_id] = { config, enabled: ch.enabled, saving: false, testing: false };
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
      [id]: { ...prev[id], config: { ...prev[id].config, [key]: value } },
    }));
  };

  const setEnabled = (id: string, value: boolean) => {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], enabled: value } }));
  };

  const save = async (id: string) => {
    const s = state[id];
    if (!s) return;
    setState((prev) => ({ ...prev, [id]: { ...prev[id], saving: true } }));
    try {
      // Фильтруем пустые секреты — не отправляем (бэкенд оставит старые).
      const config: Record<string, string | number | null> = {};
      for (const [k, v] of Object.entries(s.config)) {
        config[k] = v;
      }
      const updated = await updateChannel(id as ChannelId, { config, enabled: s.enabled });
      setList((prev) => prev.map((c) => (c.channel_id === id ? updated : c)));
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
      const result = await testChannel(id as ChannelId);
      if (result.ok) {
        addToast('success', 'Подключение работает ✓');
      } else {
        addToast('error', `Не получилось: ${result.error ?? 'неизвестная ошибка'}`);
      }
      await load();
    } catch (e) {
      addToast('error', getErrorMessage(e, 'test'));
    } finally {
      setState((prev) => ({ ...prev, [id]: { ...prev[id], testing: false } }));
    }
  };

  if (needsAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <a href="/auth/login" className="text-[hsl(var(--accent))] underline">Войдите в систему</a>
      </div>
    );
  }

  const activeCount = list.filter((c) => c.enabled && c.is_configured).length;

  return (
    <div className="min-h-screen pb-20">
      <PageHeader
        breadcrumb={[
          { label: 'Главная', href: '/' },
          { label: 'Конфигурация', href: '/settings' },
          { label: 'Каналы рассылки' },
        ]}
        title="Каналы рассылки"
      />
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <p className="mb-4 text-sm" style={{ color: 'hsl(var(--muted))' }}>
          Каналы отправки КП: Email, Telegram, WhatsApp. При недоступности основного — переход на следующий.
        </p>

        {/* Юридическое предупреждение (ФЗ-38 ст.18) */}
        <div
          className="mb-6 rounded-[12px] border p-4"
          style={{ borderColor: 'hsl(var(--signal-warm-border))', background: 'hsl(var(--signal-warm-bg))' }}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'hsl(var(--signal-warm))' }} />
            <div className="text-sm">
              <p className="font-medium" style={{ color: 'hsl(var(--signal-warm-text))' }}>
                ФЗ-38 ст. 18 (с 01.09.2025)
              </p>
              <p className="mt-1" style={{ color: 'hsl(var(--muted))' }}>
                Массовая реклама требует согласия получателя, маркировки (erid/токен) и отчётности в ЕРИР.
                Штрафы 100–500 тыс. ₽. Responsibility за consent — на отправителе.
              </p>
            </div>
          </div>
        </div>

        {/* Статус-баннер */}
        <div
          className="mb-6 rounded-[12px] border p-4"
          style={{
            borderColor: activeCount > 0 ? 'hsl(var(--signal-good-border))' : 'hsl(var(--signal-warm-border))',
            background: activeCount > 0 ? 'hsl(var(--signal-good-bg))' : 'hsl(var(--signal-warm-bg))',
          }}
        >
          <p className="text-sm font-medium">
            {activeCount === 0
              ? 'Нет активных каналов — рассылка невозможна. Настройте хотя бы один.'
              : `Активно каналов: ${activeCount} из ${list.length}.`}
          </p>
        </div>

        {/* Email — ссылка на отдельную страницу (там 3 провайдера) */}
        <Link
          href="/app/settings/email-providers"
          className="mb-6 flex items-center justify-between gap-3 rounded-[12px] border px-4 py-3 transition-colors hover:bg-[hsl(var(--surface-2))]"
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface))' }}
        >
          <span className="flex items-center gap-3">
            <Mail className="h-5 w-5 shrink-0" style={{ color: 'var(--brand)' }} />
            <span>
              <span className="block font-medium" style={{ color: 'hsl(var(--text))' }}>
                Email-каналы (Postbox / SES / Hyvor)
              </span>
              <span className="block text-xs" style={{ color: 'hsl(var(--muted))' }}>
                3 провайдера с авто-fallback и ценой за письмо →
              </span>
            </span>
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--brand)' }}>Открыть →</span>
        </Link>

        {loading && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'hsl(var(--muted))' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
          </div>
        )}

        <div className="space-y-6">
          {list.map((ch) => {
            const s = state[ch.channel_id];
            if (!s) return null;
            const Icon = CHANNEL_ICON[ch.channel_id] ?? MessageCircle;
            const status: 'ok' | 'warn' | 'bad' = ch.enabled
              ? ch.is_configured ? 'ok' : 'warn'
              : 'bad';
            const statusLabel = status === 'ok' ? 'Готов' : status === 'warn' ? 'Включён, но не настроен' : 'Отключён';
            const isMax = ch.channel_id === 'max';

            return (
              <CardV2 key={ch.channel_id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]" style={{ background: 'hsl(var(--accent-soft))' }}>
                      <Icon className="h-5 w-5" style={{ color: 'hsl(var(--accent))' }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">{ch.name}</h2>
                        <SignalPill tone={status === 'ok' ? 'good' : status === 'warn' ? 'warm' : 'muted'}>{statusLabel}</SignalPill>
                      </div>
                    </div>
                  </div>
                  {!isMax && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => setEnabled(ch.channel_id, e.target.checked)}
                        className="rounded border"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      />
                      <span className="text-sm">Включён</span>
                    </label>
                  )}
                </div>

                <p className="mt-4 text-sm" style={{ color: 'hsl(var(--muted))' }}>{ch.description}</p>

                {!isMax && (
                  <div className="mt-4 space-y-3">
                    {ch.fields.map((f) => (
                      <div key={f.key}>
                        <label className="mb-1 block text-xs font-medium" style={{ color: 'hsl(var(--muted))' }}>
                          {f.label}{f.required && <span style={{ color: 'hsl(var(--signal-warm-text))' }}> *</span>}
                        </label>
                        {f.type === 'secret' ? (
                          <Input
                            type="password"
                            value={s.config[f.key] ?? ''}
                            placeholder={f.default != null ? String(f.default) : ''}
                            onChange={(e) => setField(ch.channel_id, f.key, e.target.value)}
                          />
                        ) : (
                          <Input
                            type={f.type === 'number' ? 'number' : 'text'}
                            value={s.config[f.key] ?? ''}
                            placeholder={f.default != null ? String(f.default) : ''}
                            onChange={(e) => setField(ch.channel_id, f.key, e.target.value)}
                          />
                        )}
                        {f.description && (
                          <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted))' }}>{f.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {ch.last_test_at && (
                  <p className="mt-3 text-xs" style={{ color: 'hsl(var(--muted))' }}>
                    Проверен {formatDate(ch.last_test_at)} —{' '}
                    {ch.last_test_result === 'ok' ? (
                      <span style={{ color: 'hsl(var(--signal-good-text))' }}>OK</span>
                    ) : (
                      <span style={{ color: 'hsl(var(--signal-warm-text))' }}>ошибка: {ch.last_test_error ?? 'неизвестно'}</span>
                    )}
                  </p>
                )}

                {!isMax && (
                  <div className="mt-5 flex gap-2">
                    <ButtonV2 onClick={() => save(ch.channel_id)} disabled={s.saving}>
                      {s.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Сохранить
                    </ButtonV2>
                    <ButtonV2 variant="secondary" onClick={() => test(ch.channel_id)} disabled={s.testing}>
                      {s.testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      Проверить
                    </ButtonV2>
                  </div>
                )}

                {ch.channel_id === 'telegram' && (
                  <div className="mt-4 rounded-[8px] border p-3 text-xs" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
                    <p style={{ color: 'hsl(var(--muted))' }}>
                      <strong style={{ color: 'hsl(var(--text))' }}>Как подключить Telegram:</strong>
                    </p>
                    <ol className="mt-2 ml-4 list-decimal space-y-1" style={{ color: 'hsl(var(--muted))' }}>
                      <li>Откройте <code>@BotFather</code> в Telegram → /newbot → получите токен.</li>
                      <li>Введите токен выше, нажмите «Проверить» (должно вернуться @username бота).</li>
                      <li>Настройте webhook: POST /api/v1/outreach/setup-webhook с public_url вашего домена (HTTPS).</li>
                      <li>Лид нажимает /start в боте → его chat_id сохраняется, и КП отправляется ему в чат.</li>
                    </ol>
                  </div>
                )}
              </CardV2>
            );
          })}
        </div>
      </div>
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
