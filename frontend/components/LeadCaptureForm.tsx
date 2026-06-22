'use client';

import { useState, useId, useCallback } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Два варианта формы захвата лидов:
 *   - <LeadCaptureForm/>      — полноценная карточка для блока в середине
 *                                страницы (между KillerBlock и FAQ).
 *   - <LeadCaptureFormHero/>  — компактная dark-themed для первого экрана
 *                                (заменяет CTA-кнопки в GuestHero).
 *
 * Логика отправки общая (useLeadSubmit), верстка разная — у Hero чёрный
 * фон, белый текст, минимум полей чтобы влезала в правую колонку рядом
 * с заголовком.
 *
 * Honeypot `_hp` спрятан off-screen — боты заполняют, реальные юзеры нет.
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

function contactErrorText(channel: Channel): string {
  if (channel === 'email') return 'Похоже, в email опечатка — проверьте, пожалуйста.';
  if (channel === 'phone' || channel === 'whatsapp') return 'Номер должен содержать 10–15 цифр.';
  return 'Контакт слишком короткий.';
}

/** Общий submit-хук — обе формы используют один и тот же POST. */
function useLeadSubmit() {
  const pathname = usePathname();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (data: { name: string; channel: Channel; contact: string; wish: string; hp: string }) => {
      setError(null);
      if (!isValidContact(data.channel, data.contact)) {
        setError(contactErrorText(data.channel));
        return false;
      }
      setSubmitting(true);
      try {
        const res = await fetch('/api/v1/website-leads/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: data.name.trim(),
            channel: data.channel,
            contact: data.contact.trim(),
            wish: data.wish.trim(),
            source_page: pathname ?? '',
            referrer: typeof document !== 'undefined' ? document.referrer : '',
            _hp: data.hp,
          }),
        });
        if (res.status === 429) {
          setError('Слишком много заявок с этого IP. Попробуйте через час.');
          return false;
        }
        if (!res.ok) {
          setError('Не удалось отправить. Напишите нам в Telegram: @spinlid_support');
          return false;
        }
        setSuccess(true);
        try {
          const ym = (window as unknown as {
            ym?: (id: number, action: string, goal: string, params?: Record<string, unknown>) => void;
          }).ym;
          if (typeof ym === 'function') {
            ym(110073452, 'reachGoal', 'lead_submit', {
              channel: data.channel,
              source_page: pathname ?? '',
            });
          }
        } catch {
          /* no-op */
        }
        return true;
      } catch {
        setError('Сеть не отвечает. Попробуйте ещё раз или напишите в Telegram: @spinlid_support');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [pathname],
  );

  return { submit, submitting, success, error };
}

// ---------------------------------------------------------------------------
// Полная форма — отдельная секция страницы (между KillerBlock и FAQ).
// ---------------------------------------------------------------------------

/**
 * Полная форма захвата.
 *
 * Без `embedInHero` — самостоятельная секция с padding и max-width:
 * используется в середине страницы (между KillerBlock и FAQ).
 *
 * С `embedInHero={true}` — без внешнего section-обёрта: вставляется
 * прямо в правую колонку GuestHero на тёмном фоне. Карточка сама
 * светлая, padding контролируется родителем.
 */
export function LeadCaptureForm({ embedInHero = false }: { embedInHero?: boolean } = {}) {
  const formId = useId();
  const [channel, setChannel] = useState<Channel>('phone');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [wish, setWish] = useState('');
  const [hp, setHp] = useState('');
  const { submit, submitting, success, error } = useLeadSubmit();
  const currentChannel = CHANNELS.find((c) => c.value === channel) ?? CHANNELS[0];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await submit({ name, channel, contact, wish, hp });
  }

  if (success) {
    const successContent = (
      <div
        className="rounded-2xl p-8 md:p-10 text-center"
        style={{
          background: embedInHero
            ? 'rgba(255,255,255,0.96)'
            : 'linear-gradient(135deg, rgba(45,212,191,0.08) 0%, rgba(6,182,212,0.08) 100%)',
          border: '1px solid hsl(var(--border))',
        }}
      >
        <div style={{ fontSize: '36px' }}>✓</div>
        <h3 className="mt-2 text-xl md:text-2xl font-semibold" style={{ color: '#0b1220' }}>
          Спасибо, заявка принята
        </h3>
        <p className="mt-3 text-base" style={{ color: '#475569' }}>
          Свяжемся с вами в ближайшее время и пришлём доступ к бесплатному тестированию.
          Купон со скидкой 50% — в первом же сообщении.
        </p>
      </div>
    );
    if (embedInHero) return successContent;
    return (
      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">{successContent}</section>
    );
  }

  const formCard = (
    <div
      className="rounded-2xl p-6 md:p-8"
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: embedInHero ? '0 20px 60px rgba(0,0,0,0.35)' : undefined,
        // Светлые токены — независимо от темы родителя. Нужно потому что
        // тот же компонент стоит и в светлой части страницы, и в тёмном
        // hero. Если завязаться на CSS-переменные, тёмная тема в Hero
        // съест читаемость.
        color: '#0b1220',
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
        <h3 className="text-xl md:text-2xl font-semibold" style={{ color: '#0b1220' }}>
          Бесплатный тест 14 дней + скидка 50% первым 50
        </h3>
        <p className="mt-2 text-base" style={{ color: '#475569' }}>
          Оставьте контакт — пришлём доступ и купон. Без оплаты и подписок.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <Honeypot id={`${formId}-hp`} value={hp} onChange={setHp} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium mb-1" style={{ color: '#0b1220' }}>
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
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#0b1220',
              }}
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium mb-1" style={{ color: '#0b1220' }}>
              Способ связи <span style={{ color: '#ef4444' }}>*</span>
            </span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="w-full rounded-lg px-3 py-2 text-base"
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#0b1220',
              }}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-medium mb-1" style={{ color: '#0b1220' }}>
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
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#0b1220',
            }}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium mb-1" style={{ color: '#0b1220' }}>
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
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#0b1220',
            }}
          />
        </label>

        {error && <ErrorBox text={error} />}

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

        <p className="text-xs text-center" style={{ color: '#64748b' }}>
          Нажимая кнопку, вы соглашаетесь с{' '}
          <a href="/consent" style={{ color: '#0e9384', textDecoration: 'underline' }}>
            обработкой персональных данных
          </a>
          .
        </p>
      </form>
    </div>
  );

  if (embedInHero) return formCard;

  return (
    <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      {formCard}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Внутренние мини-компоненты.
// ---------------------------------------------------------------------------

function Honeypot({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
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
      <label htmlFor={id}>Сайт компании (не заполнять)</label>
      <input
        id={id}
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
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
      {text}
    </div>
  );
}
