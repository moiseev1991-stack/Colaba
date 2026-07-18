'use client';

// force-dynamic: страница делает API-вызовы в useEffect на клиенте.
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save, Mail } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import { apiClient } from '@/client';

interface MeResponse {
  email: string;
  reply_to_email: string | null;
}

function getErrorMessage(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { detail?: string } } };
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === 401) return 'Войдите в аккаунт';
  if (status && status >= 500) return 'Сервер недоступен';
  if (!status) return 'Сервер недоступен';
  return detail || 'Ошибка сохранения';
}

export default function ProfileSettingsPage() {
  const [loginEmail, setLoginEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<MeResponse>('/auth/me');
      setLoginEmail(res.data.email);
      setReplyTo(res.data.reply_to_email ?? '');
    } catch (e) {
      addToast('error', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmed = replyTo.trim();
      await apiClient.patch<MeResponse>('/auth/me', {
        reply_to_email: trimmed || null,
      });
      addToast('success', 'Email для ответов сохранён');
    } catch (e) {
      addToast('error', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const filled = replyTo.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Профиль" />

      <ToastContainer
        toasts={toasts}
        onClose={(id) => setToasts((p) => p.filter((t) => t.id !== id))}
      />

      {loading ? (
        <CardV2 className="flex items-center gap-2 px-4 py-6 text-[14px] text-[hsl(var(--muted))]">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </CardV2>
      ) : (
        <>
          {/* Login email — readonly, для контекста */}
          <CardV2 className="mb-4 px-4 py-3">
            <div className="flex items-center gap-2 text-[13px]">
              <Mail className="h-4 w-4 text-[hsl(var(--muted))]" />
              <span className="text-[hsl(var(--muted))]">Вход в аккаунт:</span>
              <span className="font-medium text-[hsl(var(--text))]">{loginEmail}</span>
            </div>
          </CardV2>

          {/* Reply-To email — редактируемое поле */}
          <CardV2 className="px-4 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label htmlFor="reply_to" className="text-[14px] font-medium text-[hsl(var(--text))]">
                Email для ответов
              </label>
              {filled ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> заполнен
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12px] text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" /> не указан
                </span>
              )}
            </div>

            <Input
              id="reply_to"
              type="email"
              placeholder="you@company.ru"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              autoComplete="email"
            />

            <p className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--muted))]">
              На этот адрес лиди будут отвечать на ваши КП (поле Reply-To). Может отличаться от
              логина — например, вы входите как
              <span className="text-[hsl(var(--text))]"> {loginEmail || 'user@spinlid.ru'}</span>, а
              ответы хотите получать на личный ящик. Без заполненного адреса email-рассылка
              блокируется.
            </p>

            {!filled && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  Пока поле пустое — отправить email-рассылку нельзя. Лид должен иметь возможность
                  вам ответить.
                </span>
              </div>
            )}

            <div className="mt-4">
              <ButtonV2
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={saving}
                iconLeft={
                  saving ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4" />
                }
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </ButtonV2>
            </div>
          </CardV2>
        </>
      )}
    </div>
  );
}
