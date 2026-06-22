'use client';

import { useState, useId } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Карточка-форма «оставьте заявку → бесплатный тест + скидка первым 50».
 * Стоит на публичных SEO-лендингах (parser-2gis, parser-yandex-maps,
 * parsing-otzyvov), куда приходит SEO-трафик. Для незалогиненных юзеров.
 *
 * Поля: имя/ник, способ связи (email/phone/whatsapp/telegram/max),
 * контакт, опц. пожелание. Honeypot `_hp` спрятан через off-screen +
 * tabIndex=-1 — боты заполняют, реальные юзеры не видят.
 *
 * Submit идёт на `/api/v1/website-leads/submit` через BFF-proxy. На
 * успех показываем «спасибо», форма скрывается. На ошибку сети —
 * текст с предложением написать в WhatsApp.
 */

type Channel = 'email' | 'phone' | 'whatsapp' | 'telegram' | 'max';

const CHANNELS: ReadonlyArray<{ value: Channel; label: string; placeholder: string }> = [
  { value: 'phone', label: 'Телефон', placeholder: '+7 999 123-45-67' },
  { value: 'whatsapp', label: 'WhatsApp', placeholder: '+7 999 123-45-67' },
  { value: 'telegram', label: 'Telegram', placeholder: '@username или +7…' },
  { value: 'max', label: 'MAX', placeholder: '@username' },
  { value: 'email', label: 'Email', placeholder: 'you@company.ru' },
];

function isValidContact(channel: Channel, contact: string): boolean {
  const v = contact.trim();
  if (v.length < 2) return false;
  if (channel === 'email') {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 255;
  }
  if (channel === 'phone' || channel === 'whatsapp') {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }
  return v.length >= 3;
}

export function LeadCaptureForm() {
  const pathname = usePathname();
  const formId = useId();

  const [channel, setChannel] = useState<Channel>('phone');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [wish, setWish] = useState('');
  const [hp, setHp] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentChannel = CHANNELS.find((c) => c.value === channel) ?? CHANNELS[0];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!isValidContact(channel, contact)) {
      setError(
        channel === 'email'
          ? 'Похоже, в email опечатка — проверьте, пожалуйста.'
          : channel === 'phone' || channel === 'whatsapp'
          ? 'Номер должен содержать 10–15 цифр.'
          : 'Контакт слишком короткий.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/website-leads/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          channel,
          contact: contact.trim(),
          wish: wish.trim(),
          source_page: pathname ?? '',
          referrer: typeof document !== 'undefined' ? document.referrer : '',
          _hp: hp,
        }),
      });
      if (res.status === 429) {
        setError('Слишком много заявок с этого IP. Попробуйте через час.');
        return;
      }
      if (!res.ok) {
        setError('Не удалось отправить. Напишите нам в Telegram: @spinlid_support');
        return;
      }
      setSuccess(true);
      // Сигнал в Метрику для трекинга цели (если она инициализирована).
      try {
        const ym = (window as unknown as {
          ym?: (id: number, action: string, goal: string, params?: Record<string, unknown>) => void;
        }).ym;
        if (typeof ym === 'function') {
          ym(110073452, 'reachGoal', 'lead_submit', { channel, source_page: pathname ?? '' });
        }
      } catch { /* no-op */ }
    } catch {
      setError('Сеть не отвечает. Попробуйте ещё раз или напишите в Telegram: @spinlid_support');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <div
          className="rounded-2xl p-8 md:p-10 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(45,212,191,0.08) 0%, rgba(6,182,212,0.08) 100%)',
            border: '1px solid hsl(var(--border))',
          }}
        >
          <div style={{ fontSize: '36px' }}>✓</div>
          <h3 className="mt-2 text-xl md:text-2xl font-semibold" style={{ color: 'hsl(var(--text))' }}>
            Спасибо, заявка принята
          </h3>
          <p className="mt-3 text-base" style={{ color: 'hsl(var(--muted))' }}>
            Свяжемся с вами в ближайшее время и пришлём доступ к бесплатному тестированию.
            Купон со скидкой 50% — в первом же сообщении.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <div
        className="rounded-2xl p-6 md:p-10"
        style={{
          background: 'hsl(var(--surface))',
          border: '1px solid hsl(var(--border))',
        }}
      >
        <div className="text-center">
          <div
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              background: 'rgba(45,212,191,0.15)',
              color: '#0e9384',
              marginBottom: '12px',
            }}
          >
            Доступ ограничен: первые 50 заявок
          </div>
          <h3 className="text-xl md:text-2xl font-semibold" style={{ color: 'hsl(var(--text))' }}>
            Бесплатный тест 14 дней + скидка 50% первым 50
          </h3>
          <p className="mt-2 text-base" style={{ color: 'hsl(var(--muted))' }}>
            Оставьте контакт — пришлём доступ и купон. Без оплаты и подписок.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          {/* Honeypot — невидим для людей, ловит ботов. tabIndex=-1 и aria-hidden
              чтобы вообще не попадал в навигацию. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-10000px',
              top: 'auto',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
            }}
          >
            <label htmlFor={`${formId}-hp`}>Сайт компании (не заполнять)</label>
            <input
              id={`${formId}-hp`}
              type="text"
              name="company_website"
              tabIndex={-1}
              autoComplete="off"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--text))' }}>
                Как к вам обращаться
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя или ник"
                maxLength={120}
                className="w-full rounded-lg px-3 py-2 text-base"
                style={{
                  background: 'hsl(var(--bg))',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--text))',
                }}
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--text))' }}>
                Способ связи <span style={{ color: '#ef4444' }}>*</span>
              </span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                className="w-full rounded-lg px-3 py-2 text-base"
                style={{
                  background: 'hsl(var(--bg))',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--text))',
                }}
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--text))' }}>
              Контакт ({currentChannel.label}) <span style={{ color: '#ef4444' }}>*</span>
            </span>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={currentChannel.placeholder}
              maxLength={255}
              required
              className="w-full rounded-lg px-3 py-2 text-base"
              style={{
                background: 'hsl(var(--bg))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--text))',
              }}
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--text))' }}>
              Пожелание (необязательно)
            </span>
            <textarea
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              placeholder="Какая ниша/город? Что хотите парсить?"
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg px-3 py-2 text-base resize-none"
              style={{
                background: 'hsl(var(--bg))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--text))',
              }}
            />
          </label>

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#dc2626',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg py-3 text-base font-semibold disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
              color: '#0b1220',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Отправляем…' : 'Получить доступ'}
          </button>

          <p className="text-xs text-center" style={{ color: 'hsl(var(--muted))' }}>
            Нажимая кнопку, вы соглашаетесь с{' '}
            <a href="/consent" style={{ color: '#0e9384', textDecoration: 'underline' }}>
              обработкой персональных данных
            </a>
            .
          </p>
        </form>
      </div>
    </section>
  );
}
