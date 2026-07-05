'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/client';
import {
  getEmailSettings,
  updateEmailSettings,
  getEmailStatus,
  type EmailSettingsDTO,
} from '@/src/services/api/emailSettings';
import {
  Loader2,
  Mail,
  Save,
  Server,
  Copy,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
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
      // На этой странице редактируются только IMAP + подпись КП + DNS.
      // Настройки провайдеров отправки (Postbox/SES/Hyvor) вынесены
      // на отдельную страницу /app/settings/email-providers — туда и
      // отправляем поля smtp_*/hyvor_* не нужно.
      const updated = await updateEmailSettings({
        reply_to_email: form.reply_to_email,
        imap_host: form.imap_host,
        imap_port: form.imap_port,
        imap_user: form.imap_user,
        imap_password: form.imap_password,
        imap_use_ssl: form.imap_use_ssl,
        imap_mailbox: form.imap_mailbox,
        reply_prefix: form.reply_prefix,
        sender_signature_html: form.sender_signature_html,
        sender_logo_url: form.sender_logo_url,
        sender_brand_color: form.sender_brand_color,
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
          {/* Баннер-ссылка на новую страницу провайдеров отправки.
              Раньше тут была форма с radio (Hyvor/SMTP) — она дублировала
              /app/settings/email-providers. Теперь настройки каналов
              отправки (Postbox/SES/Hyvor с fallback и ценой за письмо)
              живут отдельно; тут только ссылка. */}
          <Link
            href="/app/settings/email-providers"
            className="mb-6 flex items-center justify-between gap-3 rounded-v2-sm border px-4 py-3 transition-colors hover:bg-[hsl(var(--surface-2))]"
            style={{
              borderColor: 'hsl(var(--border))',
              background: 'hsl(var(--surface))',
            }}
          >
            <span className="flex items-center gap-3">
              <Mail className="h-5 w-5 shrink-0" style={{ color: 'var(--brand)' }} />
              <span>
                <span className="block font-medium" style={{ color: 'hsl(var(--text))' }}>
                  Провайдеры отправки (Postbox / SES / Hyvor)
                </span>
                <span className="block text-xs" style={{ color: 'hsl(var(--muted))' }}>
                  Каналы отправки писем с автоматическим резервом и ценой за письмо →
                </span>
              </span>
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--brand)' }}>
              Открыть →
            </span>
          </Link>

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
              className="font-display font-semibold tracking-tight text-[15px] mb-1 flex items-center gap-2"
              style={{ color: 'hsl(var(--text))' }}
            >
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Оформление КП-писем
            </h2>
            <p className="text-xs mb-4" style={{ color: 'hsl(var(--muted))' }}>
              Шапка с логотипом и подвал с подписью попадают в каждое
              письмо, которое уходит со страницы партии. Все поля опциональны
              — пустое поле просто скрывает соответствующий блок.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>
                    Логотип (URL)
                  </label>
                  <input
                    className={INPUT_CLS}
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                    value={form.sender_logo_url || ''}
                    onChange={(e) => updateField('sender_logo_url', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>
                    Акцент-цвет (hex)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.sender_brand_color || '#3B82F6'}
                      onChange={(e) =>
                        updateField('sender_brand_color', e.target.value.toUpperCase())
                      }
                      className="h-9 w-12 rounded-v2-sm border cursor-pointer p-0"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    />
                    <input
                      className={INPUT_CLS}
                      style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                      value={form.sender_brand_color || ''}
                      onChange={(e) => updateField('sender_brand_color', e.target.value)}
                      placeholder="#3B82F6"
                    />
                  </div>
                </div>
              </div>
              {form.sender_logo_url ? (
                <div
                  className="mt-1 inline-flex items-center gap-2 rounded-v2-sm border px-3 py-2"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    background: 'hsl(var(--surface-2))',
                  }}
                >
                  {/* Чистая <img/> вместо next/image: внешний URL без
                      сконфигурированного next-image-domain → next/image
                      даст 400. Это превью, не layout-критичное место. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.sender_logo_url}
                    alt="Превью логотипа"
                    style={{
                      maxHeight: 32,
                      maxWidth: 120,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                    превью
                  </span>
                </div>
              ) : null}
              <div>
                <label className={LABEL_CLS} style={{ color: 'hsl(var(--muted))' }}>
                  Подпись (markdown)
                </label>
                <textarea
                  rows={5}
                  className={`${INPUT_CLS} font-mono text-[12.5px]`}
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text))' }}
                  value={form.sender_signature_html || ''}
                  onChange={(e) =>
                    updateField('sender_signature_html', e.target.value)
                  }
                  placeholder={
                    '**Дима Моисеев**, Colaba\n' +
                    '[colaba.ru](https://colaba.ru) · +7 999 000-00-00'
                  }
                />
                <p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
                  Markdown: **жирный**, [ссылка](url), переносы строк
                  сохраняются. HTML-теги допустимы, но не используйте
                  &lt;script&gt;.
                </p>
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
        </>
      )}
    </div>
  );
}
