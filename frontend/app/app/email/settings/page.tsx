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
import { cn } from '@/lib/utils';
import { Loader2, Mail, Save, Server, Copy, CheckCircle2, AlertCircle } from 'lucide-react';

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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--text))' }}>
          <Server className="h-5 w-5" />
          Настройка email
        </h1>
        <Link
          href="/app/email/campaigns"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Рассылки
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {status && (
        <div
          className={cn(
            'mb-6 rounded-lg border px-4 py-3 flex items-start gap-3',
            status.configured
              ? 'border-green-200 dark:border-green-800 bg-green-50/80 dark:bg-green-950/20'
              : 'border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20'
          )}
        >
          {status.configured ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          )}
          <div>
            <div className="font-medium" style={{ color: 'hsl(var(--text))' }}>
              {status.configured
                ? `Отправка настроена (${status.provider})`
                : 'Отправка писем не настроена или не проверена'}
            </div>
            <p className="text-sm mt-1 opacity-80">
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
          <section className="mb-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'hsl(var(--text))' }}>
              <Mail className="h-4 w-4" />
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
                  <label className="block text-xs font-medium mb-1 opacity-80">API URL</label>
                  <input
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    value={form.hyvor_api_url || ''}
                    onChange={(e) => updateField('hyvor_api_url', e.target.value)}
                    placeholder="http://hyvor-relay:8000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">API Key</label>
                  <input
                    type="password"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    value={form.hyvor_api_key}
                    onChange={(e) => updateField('hyvor_api_key', e.target.value)}
                    placeholder="***"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">Webhook secret</label>
                  <input
                    type="password"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    value={form.hyvor_webhook_secret}
                    onChange={(e) => updateField('hyvor_webhook_secret', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleTestHyvor}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Проверить подключение к Hyvor
                </button>
              </div>
            )}

            {form.provider_type === 'smtp' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 opacity-80">SMTP host</label>
                    <input
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      value={form.smtp_host || ''}
                      onChange={(e) => updateField('smtp_host', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 opacity-80">Порт</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      value={form.smtp_port ?? ''}
                      onChange={(e) => updateField('smtp_port', parseInt(e.target.value, 10) || 0)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 opacity-80">Пользователь</label>
                    <input
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      value={form.smtp_user || ''}
                      onChange={(e) => updateField('smtp_user', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 opacity-80">Пароль</label>
                    <input
                      type="password"
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
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
                    <label className="block text-xs font-medium mb-1 opacity-80">From email</label>
                    <input
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      value={form.smtp_from_email || ''}
                      onChange={(e) => updateField('smtp_from_email', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 opacity-80">From name</label>
                    <input
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      value={form.smtp_from_name || ''}
                      onChange={(e) => updateField('smtp_from_name', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">Кому отправить тест</label>
                  <input
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm mb-2"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <button
                    type="button"
                    onClick={handleTestSmtp}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Отправить тестовое письмо
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="mb-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--text))' }}>
              Приём ответов (IMAP)
            </h2>
            <p className="text-xs opacity-80 mb-4">
              Настройте catch-all на домене, чтобы письма на{' '}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">reply-{'{id}'}@domain</code> попадали в один
              ящик.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">IMAP host</label>
                  <input
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    value={form.imap_host || ''}
                    onChange={(e) => updateField('imap_host', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">Порт</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    value={form.imap_port ?? ''}
                    onChange={(e) => updateField('imap_port', parseInt(e.target.value, 10) || 993)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">Пользователь</label>
                  <input
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    value={form.imap_user || ''}
                    onChange={(e) => updateField('imap_user', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">Пароль</label>
                  <input
                    type="password"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
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
                <label className="block text-xs font-medium mb-1 opacity-80">Портфель (mailbox)</label>
                <input
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  value={form.imap_mailbox}
                  onChange={(e) => updateField('imap_mailbox', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 opacity-80">Префикс Reply-To</label>
                <input
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  value={form.reply_prefix}
                  onChange={(e) => updateField('reply_prefix', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 opacity-80">Reply-To (общий, опционально)</label>
                <input
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  value={form.reply_to_email || ''}
                  onChange={(e) => updateField('reply_to_email', e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="mb-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--text))' }}>
              Справка: DNS записи
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left py-2 pr-2">Тип</th>
                    <th className="text-left py-2 pr-2">Имя</th>
                    <th className="text-left py-2 pr-2">Пример значения</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {DNS_ROWS.map((row) => (
                    <tr key={row.type} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-2 font-medium">{row.type}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{row.name}</td>
                      <td className="py-2 pr-2 font-mono text-xs break-all">{row.value}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => copy(row.value, row.type)}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                          title="Копировать"
                        >
                          {copied === row.type ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
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
            <ul className="mt-4 space-y-2 text-xs opacity-80">
              {DNS_ROWS.map((row) => (
                <li key={row.type}><strong>{row.type}:</strong> {row.hint}</li>
              ))}
            </ul>
          </section>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Сохранить
            </button>
          </div>

          {testMsg && (
            <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">{testMsg}</p>
          )}
        </>
      )}
    </div>
  );
}
