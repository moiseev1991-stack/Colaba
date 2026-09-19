'use client';

// force-dynamic: страница делает API-вызовы в useEffect на клиенте.
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

import { PageContainer, PageColumn, PageHeader } from '@/components/ui/page';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { Input } from '@/components/ui/input';
import { apiClient, tokenStorage } from '@/client';
import { toast } from '@/components/ui/toast';

interface MeResponse {
  email: string;
  reply_to_email: string | null;
  email_verified?: boolean;
}

interface ConnectionsResponse {
  connections: { provider: string; email: string | null; name: string | null }[];
}

const PROVIDER_LABELS: Record<string, string> = {
  yandex: 'Яндекс ID',
  vk: 'VK ID',
  google: 'Google',
  telegram: 'Telegram',
};

function getErrorMessage(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { detail?: unknown } } };
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === 401) return 'Войдите в аккаунт';
  if (status && status >= 500) return 'Сервер недоступен';
  if (!status) return 'Сервер недоступен';
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message);
  return 'Ошибка сохранения';
}

function logoutLocally() {
  try {
    tokenStorage.setTokens('', '');
  } catch {
    // куки могли уже убрать
  }
}

export default function ProfileSettingsPage() {
  const [loginEmail, setLoginEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [replyTo, setReplyTo] = useState('');
  const [connections, setConnections] = useState<ConnectionsResponse['connections']>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Смена пароля
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Смена email
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  // Удаление аккаунта
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, conn] = await Promise.all([
        apiClient.get<MeResponse>('/auth/me'),
        apiClient
          .get<ConnectionsResponse>('/auth/connections')
          .catch(() => ({ data: { connections: [] } })),
      ]);
      setLoginEmail(me.data.email);
      setEmailVerified(Boolean(me.data.email_verified));
      setReplyTo(me.data.reply_to_email ?? '');
      setConnections(conn.data.connections);
    } catch (e) {
      toast.error(getErrorMessage(e));
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
      toast.success('Email для ответов сохранён');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('Новый пароль — минимум 8 символов');
      return;
    }
    if (newPassword !== newPassword2) {
      toast.error('Новые пароли не совпадают');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await apiClient.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success(res.data?.message ?? 'Пароль изменён');
      setTimeout(() => {
        window.location.href = '/auth/login';
      }, 1200);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleEmailChangeRequest = async () => {
    if (!newEmail.trim()) return;
    setChangingEmail(true);
    try {
      const res = await apiClient.post('/auth/email/change-request', {
        password: emailPassword,
        new_email: newEmail.trim(),
      });
      toast.success(res.data?.message ?? 'Письмо отправлено');
      setNewEmail('');
      setEmailPassword('');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setChangingEmail(false);
    }
  };

  const handleRevokeSessions = async () => {
    try {
      await apiClient.post('/auth/sessions/revoke');
      logoutLocally();
      window.location.href = '/auth/login';
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'УДАЛИТЬ') {
      toast.error('Введите слово УДАЛИТЬ для подтверждения');
      return;
    }
    setDeleting(true);
    try {
      await apiClient.delete('/auth/account', { data: { password: deletePassword } });
      logoutLocally();
      window.location.href = '/';
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const filled = replyTo.trim().length > 0;

  return (
    <PageContainer>
      <PageColumn>
        <PageHeader title="Аккаунт" description="Профиль, безопасность и управление доступом" />
        {loading ? (
          <CardV2 className="flex items-center gap-2 px-4 py-6 text-sm text-[hsl(var(--muted))]">
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
          </CardV2>
        ) : (
          <>
            {/* Email входа + верификация + подключённые входы */}
            <CardV2 className="mb-4 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-small">
                <Mail className="h-4 w-4 text-[hsl(var(--muted))]" />
                <span className="text-[hsl(var(--muted))]">Вход в аккаунт:</span>
                <span className="font-medium text-[hsl(var(--text))]">{loginEmail}</span>
                {emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <BadgeCheck className="h-3.5 w-3.5" /> подтверждён
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5" /> не подтверждён
                  </span>
                )}
              </div>
              {connections.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-small">
                  <span className="text-[hsl(var(--muted))]">Соцвходы:</span>
                  {connections.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-xs text-[hsl(var(--text))]"
                    >
                      {PROVIDER_LABELS[c.provider] ?? c.provider}
                      {c.email ? ` · ${c.email}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </CardV2>

            {/* Безопасность: смена пароля */}
            <CardV2 className="mb-4 px-4 py-4">
              <div className="mb-3 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[hsl(var(--muted))]" />
                <h2 className="text-sm font-semibold text-[hsl(var(--text))]">Смена пароля</h2>
              </div>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Текущий пароль"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <Input
                  type="password"
                  placeholder="Новый пароль (минимум 8 символов)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  placeholder="Новый пароль ещё раз"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <p className="mt-2 text-xs text-[hsl(var(--muted))]">
                После смены пароля все сессии завершаются — на всех устройствах потребуется
                повторный вход.
              </p>
              <div className="mt-3">
                <ButtonV2
                  variant="primary"
                  size="md"
                  loading={changingPassword}
                  disabled={!currentPassword || !newPassword || !newPassword2}
                  onClick={handleChangePassword}
                >
                  Сменить пароль
                </ButtonV2>
              </div>
            </CardV2>

            {/* Смена email */}
            <CardV2 className="mb-4 px-4 py-4">
              <div className="mb-3 flex items-center gap-2">
                <Mail className="h-4 w-4 text-[hsl(var(--muted))]" />
                <h2 className="text-sm font-semibold text-[hsl(var(--text))]">Смена email</h2>
              </div>
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="Новый email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  autoComplete="email"
                />
                <Input
                  type="password"
                  placeholder="Пароль для подтверждения"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <p className="mt-2 text-xs text-[hsl(var(--muted))]">
                Письмо с подтверждением уйдёт на новый адрес; текущий email продолжит работать, пока
                вы не подтвердите смену по ссылке.
              </p>
              <div className="mt-3">
                <ButtonV2
                  variant="secondary"
                  size="md"
                  loading={changingEmail}
                  disabled={!newEmail.trim() || !emailPassword}
                  onClick={handleEmailChangeRequest}
                >
                  Отправить подтверждение
                </ButtonV2>
              </div>
            </CardV2>

            {/* Reply-To email — редактируемое поле */}
            <CardV2 className="mb-4 px-4 py-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor="reply_to" className="text-sm font-medium text-[hsl(var(--text))]">
                  Email для ответов
                </label>
                {filled ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> заполнен
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
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

              <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted))]">
                На этот адрес лиди будут отвечать на ваши КП (поле Reply-To). Может отличаться от
                логина — например, вы входите как
                <span className="text-[hsl(var(--text))]"> {loginEmail || 'user@spinlid.ru'}</span>,
                а ответы хотите получать на личный ящик. Без заполненного адреса email-рассылка
                блокируется.
              </p>

              <div className="mt-4">
                <ButtonV2
                  variant="primary"
                  size="md"
                  loading={saving}
                  disabled={!loginEmail}
                  onClick={handleSave}
                >
                  <Save className="h-4 w-4" aria-hidden /> Сохранить
                </ButtonV2>
              </div>
            </CardV2>

            {/* Сессии */}
            <CardV2 className="mb-4 px-4 py-4">
              <div className="mb-2 flex items-center gap-2">
                <LogOut className="h-4 w-4 text-[hsl(var(--muted))]" />
                <h2 className="text-sm font-semibold text-[hsl(var(--text))]">Сессии</h2>
              </div>
              <p className="text-xs text-[hsl(var(--muted))]">
                Завершить все активные сеансы на всех устройствах — полезно, если вы входили с
                чужого компьютера.
              </p>
              <div className="mt-3">
                <ButtonV2 variant="secondary" size="md" onClick={handleRevokeSessions}>
                  Выйти со всех устройств
                </ButtonV2>
              </div>
            </CardV2>

            {/* Опасная зона */}
            <CardV2 className="mb-4 border-red-200 px-4 py-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-semibold text-red-700">Опасная зона</h2>
              </div>
              <p className="text-xs leading-relaxed text-[hsl(var(--muted))]">
                Деактивация аккаунта: вход и все сессии закрываются, данные остаются у сервиса.
                Последнего администратора удалить нельзя.
              </p>
              <div className="mt-3 space-y-2">
                <Input
                  type="password"
                  placeholder="Пароль для подтверждения"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoComplete="current-password"
                />
                <Input
                  type="text"
                  placeholder="Введите слово УДАЛИТЬ"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                />
              </div>
              <div className="mt-3">
                <ButtonV2
                  variant="danger"
                  size="md"
                  loading={deleting}
                  disabled={!deletePassword || deleteConfirmText.trim().toUpperCase() !== 'УДАЛИТЬ'}
                  onClick={handleDeleteAccount}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Удалить аккаунт
                </ButtonV2>
              </div>
            </CardV2>
          </>
        )}
      </PageColumn>
    </PageContainer>
  );
}
