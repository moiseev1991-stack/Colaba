'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/client';
import {
  getEmailSettings,
  updateEmailSettings,
  testSmtpConnection,
  testHyvorConnection,
  getEmailStatus,
  type EmailSettingsDTO,
} from '@/src/services/api/emailSettings';
import { Loader2, Mail, Save, Server, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { CardV2 } from '@/components/ui/CardV2';
import { ButtonV2 } from '@/components/ui/ButtonV2';

// §4.7 ТЗ редизайна 2026-06-03 (Phase C batch 1): единый стиль input на токенах.
// Раньше каждое поле имело клон `rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm` —
// теперь одна константа. Brand-focus уже глобален из @layer base (input:focus → --control-border-focus).
const INPUT_CLS =
  'w-full rounded-v2-sm border bg-[hsl(var(--surface))] px-3 py-2 text-sm transition-colors';
const LABEL_CLS = 'block text-xs font-medium mb-1';

type MeResponse = { email: string; is_superuser?: boolean };

const DNS_ROWS = [
  {
    type: 'SPF',
    name: '@',
    value: 'v=spf1 include:_spf.example.com ~all',
    hint: 'Разрешённые серверы отправки. Замените include на вашего провайдера или Hyvor Relay.',
  },
  {
    type: 'DKIM',
    name: 'default._domainkey',
    value: 'v=DKIM1; k=rsa; p=...',
    hint: 'Публичный ключ DKIM — значение выдаёт почтовый сервер (Hyvor Relay или SMTP-провайдер).',
  },
  {
    type: 'DMARC',
    name: '_dmarc',
    value: 'v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com',
    hint: 'Политика для почтовых ящиков; начните с p=none, затем усиливайте.',
  },
];

export default function EmailSettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<{ configured: boolean; provider: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EmailSettingsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, st] = await Promise.all([
        apiClient.get<MeResponse>('/auth/me'),
        getEmailStatus(),
      ]);
      setMe(meRes.data);
      setStatus(st);
      if (meRes.data.is_superuser) {
        const cfg = await getEmailSettings();
        setForm(cfg);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = <K extends keyof EmailSettingsDTO>(key: K, value: EmailSettingsDTO[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateEmailSettings({
        provider_type: form.provider_type,
        hyvor_api_url: form.hyvor_api_url,
        hyvor_api_key: form.hyvor_api_key,
        hyvor_webhook_secret: form.hyvor_webhook_secret,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_user: form.smtp_user,
        smtp_password: form.smtp_password,
        smtp_use_ssl: form.smtp_use_ssl,
        smtp_from_email: form.smtp_from_email,
        smtp_from_name: form.smtp_from_name,
        reply_to_email: form.reply_to_email,
        imap_host: form.imap_host,
        imap_port: form.imap_port,
        imap_user: form.imap_user,
        imap_password: form.imap_password,
        imap_use_ssl: form.imap_use_ssl,
        imap_mailbox: form.imap_mailbox,
        reply_prefix: form.reply_prefix,
      });
      setForm(updated);
      const st = await getEmailStatus();
      setStatus(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!testEmail.trim()) {
      setTestMsg('Укажите email для теста');
      return;
    }
    setTestMsg(null);
    try {
      const r = await testSmtpConnection(testEmail.trim());
      setTestMsg(r.success ? r.message : r.message);
      const st = await getEmailStatus();
      setStatus(st);
      if (me?.is_superuser) {
        const cfg = await getEmailSettings();
        setForm(cfg);
      }
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Ошибка теста');
    }
  };

  const handleTestHyvor = async () => {
    setTestMsg(null);
    try {
      const r = await testHyvorConnection();
      setTestMsg(r.success ? r.message : r.message);
      const st = await getEmailStatus();
      setStatus(st);
      if (me?.is_superuser) {
        const cfg = await getEmailSettings();
        setForm(cfg);
      }
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Ошибка теста');
    }
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'hsl(var(--muted))' }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="flex items-center gap-2 font-display font-semibold tracking-tight"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
        >
          <Server className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          Настройка email
        </h1>
        <Link
          href="/app/email/campaigns"
          className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
        >
          ← Рассылки
        </Link>
      </div>

      {error && (
        <div
          className="mb-4 rounded-v2-sm border px-4 py-3 text-sm flex items-start gap-2"
          style={{
            background: 'var(--signal-hot-bg)',
            borderColor: 'rgb(239 68 68 / 0.3)',
            color: 'var(--signal-hot)',
          }}
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {status && (
        <div
          className="mb-6 rounded-v2-sm border px-4 py-3 flex items-start gap-3"
          style={{
            background: status.configured ? 'var(--signal-good-bg)' : 'var(--signal-warm-bg)',
            borderColor: status.configured ? 'rgb(16 185 129 / 0.3)' : 'rgb(245 158 11 / 0.3)',
          }}
        >
          {status.configured ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--signal-good)' }} />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--signal-warm)' }} />
          )}
          <div>
            <div className="font-medium" style={{ color: 'hsl(var(--text))' }}>
              {status.configured
                ? `Отправка настроена (${status.provider})`
                : 'Отправка писем не настроена или не проверена'}
            </div>
            <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted))' }}>
              {status.configured
                ? 'Суперпользователь может изменить провайдера и параметры ниже.'
                : 'Суперпользователь должен сохранить настройки и выполнить тест подключения.'}
            </p>
          </div>
        </div>
      )}

      {!me?.is_superuser && (
        <p className="text-sm mb-6 opacity-80" style={{ color: 'hsl(var(--text))' }}>
          Изменение настроек доступно только суперпользователю (через эту страницу или SQLAdmin).
        </p>
      )}

      {me?.is_superuser && form && (
        <>
          <CardV2 as="section" className="mb-6 p-5">
            <h2
              className="font-display font-semibold tracking-tight text-[15px] mb-4 flex items-center gap-2"
              style={{ color: 'hsl(var(--text))' }}
            >
              <Mail className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Провайдер отправки
            </h2>
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="provider"
                  checked={form.provider_type === 'hyvor'}
                  onChange={() => updateField('provider_type', 'hyvor')}
                />
                Hyvor Relay
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="provider"
                  checked={form.provider_type === 'smtp'}
                  onChange={() => updateField('provider_type', 'smtp')}
                />
                Облачный SMTP
              </label>
            </div>

            {form.provider_type === 'hyvor' && (
              <div className="space-y-3">
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>API URL</label>
                  <input
                    className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={form.hyvor_api_url || ''}
                    onChange={(e) => updateField('hyvor_api_url', e.target.value)}
                    placeholder="http://hyvor-relay:8000"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>API Key</label>
                  <input
                    type="password"
                    className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={form.hyvor_api_key}
                    onChange={(e) => updateField('hyvor_api_key', e.target.value)}
                    placeholder="***"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Webhook secret</label>
                  <input
                    type="password"
                    className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={form.hyvor_webhook_secret}
                    onChange={(e) => updateField('hyvor_webhook_secret', e.target.value)}
                  />
                </div>
                <ButtonV2 variant="secondary" size="sm" onClick={handleTestHyvor}>
                  Проверить подключение к Hyvor
                </ButtonV2>
              </div>
            )}

            {form.provider_type === 'smtp' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>SMTP host</label>
                    <input
                      className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                      value={form.smtp_host || ''}
                      onChange={(e) => updateField('smtp_host', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Порт</label>
                    <input
                      type="number"
                      className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                      value={form.smtp_port ?? ''}
                      onChange={(e) => updateField('smtp_port', parseInt(e.target.value, 10) || 0)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Пользователь</label>
                    <input
                      className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                      value={form.smtp_user || ''}
                      onChange={(e) => updateField('smtp_user', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Пароль</label>
                    <input
                      type="password"
                      className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                      value={form.smtp_password}
                      onChange={(e) => updateField('smtp_password', e.target.value)}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.smtp_use_ssl}
                    onChange={(e) => updateField('smtp_use_ssl', e.target.checked)}
                  />
                  SSL/TLS (порт 465) — снимите для STARTTLS на 587
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>From email</label>
                    <input
                      className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                      value={form.smtp_from_email || ''}
                      onChange={(e) => updateField('smtp_from_email', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>From name</label>
                    <input
                      className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                      value={form.smtp_from_name || ''}
                      onChange={(e) => updateField('smtp_from_name', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Кому отправить тест</label>
                  <input
                    className={`${INPUT_CLS} mb-2`}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <ButtonV2 variant="secondary" size="sm" onClick={handleTestSmtp}>
                    Отправить тестовое письмо
                  </ButtonV2>
                </div>
              </div>
            )}
          </CardV2>

          <CardV2 as="section" className="mb-6 p-5">
            <h2
              className="font-display font-semibold tracking-tight text-[15px] mb-4"
              style={{ color: 'hsl(var(--text))' }}
            >
              Приём ответов (IMAP)
            </h2>
            <p className="text-xs mb-4" style={{ color: 'hsl(var(--muted))' }}>
              Настройте catch-all на домене, чтобы письма на{' '}
              <code
                className="px-1.5 py-0.5 rounded-v2-sm text-[11px] font-mono"
                style={{ background: 'hsl(var(--surface-2))', color: 'hsl(var(--text))' }}
              >reply-{'{id}'}@domain</code> попадали в один
              ящик.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>IMAP host</label>
                  <input
                    className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={form.imap_host || ''}
                    onChange={(e) => updateField('imap_host', e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Порт</label>
                  <input
                    type="number"
                    className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={form.imap_port ?? ''}
                    onChange={(e) => updateField('imap_port', parseInt(e.target.value, 10) || 993)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Пользователь</label>
                  <input
                    className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={form.imap_user || ''}
                    onChange={(e) => updateField('imap_user', e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Пароль</label>
                  <input
                    type="password"
                    className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={form.imap_password}
                    onChange={(e) => updateField('imap_password', e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.imap_use_ssl}
                  onChange={(e) => updateField('imap_use_ssl', e.target.checked)}
                />
                IMAP SSL
              </label>
              <div>
                <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Портфель (mailbox)</label>
                <input
                  className={INPUT_CLS}
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                  value={form.imap_mailbox}
                  onChange={(e) => updateField('imap_mailbox', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Префикс Reply-To</label>
                <input
                  className={INPUT_CLS}
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                  value={form.reply_prefix}
                  onChange={(e) => updateField('reply_prefix', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>Reply-To (общий, опционально)</label>
                <input
                  className={INPUT_CLS}
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                  value={form.reply_to_email || ''}
                  onChange={(e) => updateField('reply_to_email', e.target.value)}
                />
              </div>
            </div>
          </CardV2>

          <CardV2 as="section" className="mb-6 p-5">
            <h2
              className="font-display font-semibold tracking-tight text-[15px] mb-4"
              style={{ color: 'hsl(var(--text))' }}
            >
              Справка: DNS записи
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                    <th
                      className="text-left py-2 pr-2 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'hsl(var(--muted))' }}
                    >Тип</th>
                    <th
                      className="text-left py-2 pr-2 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'hsl(var(--muted))' }}
                    >Имя</th>
                    <th
                      className="text-left py-2 pr-2 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'hsl(var(--muted))' }}
                    >Пример значения</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {DNS_ROWS.map((row) => (
                    <tr key={row.type} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                      <td className="py-2 pr-2 font-medium" style={{ color: 'hsl(var(--text))' }}>{row.type}</td>
                      <td className="py-2 pr-2 font-mono text-xs" style={{ color: 'hsl(var(--text))' }}>{row.name}</td>
                      <td className="py-2 pr-2 font-mono text-xs break-all" style={{ color: 'hsl(var(--text))' }}>{row.value}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => copy(row.value, row.type)}
                          className="p-1.5 rounded-v2-sm transition-colors hover:bg-[hsl(var(--surface-2))]"
                          title="Копировать"
                          style={{ color: 'hsl(var(--muted))' }}
                        >
                          {copied === row.type ? (
                            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--signal-good)' }} />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-4 space-y-2 text-xs" style={{ color: 'hsl(var(--muted))' }}>
              {DNS_ROWS.map((row) => (
                <li key={row.type}>
                  <strong style={{ color: 'hsl(var(--text))' }}>{row.type}:</strong> {row.hint}
                </li>
              ))}
            </ul>
          </CardV2>

          <div className="flex justify-end gap-3">
            <ButtonV2
              variant="primary"
              size="md"
              onClick={handleSave}
              loading={saving}
              iconLeft={<Save />}
            >
              Сохранить
            </ButtonV2>
          </div>

          {testMsg && (
            <p className="mt-4 text-sm" style={{ color: 'hsl(var(--text))' }}>{testMsg}</p>
          )}
        </>
      )}
    </div>
  );
}
