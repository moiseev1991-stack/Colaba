'use client';

import Link from 'next/link';
import { Mail, MessageSquareQuote, Phone, Sparkles } from 'lucide-react';
import { HeroBackgroundDecor } from '@/components/HeroBackgroundDecor';
import { OFFER } from '@/lib/offer';

// Первый экран главной (PR 2.2): для кого и какой результат — одной фразой, одна главная
// кнопка (регистрация), вторая — пример на /demo. Справа — карточка компании из кабинета
// с жалобами клиентов: так таблица-пример ниже не дублируется.

const PAINS = [
  {
    label: 'Долгое ожидание',
    count: 12,
    quote: 'Записала ребёнка на 10:00, приняли в 11:20. Полтора часа в коридоре — это перебор.',
  },
  {
    label: 'Не перезванивают',
    count: 5,
    quote: 'Оставила заявку через сайт три дня назад — ни звонка, ни SMS.',
  },
];

export function HeroSection({ onCtaRegister }: { onCtaRegister: () => void }) {
  return (
    <section className="l-hero" id="top">
      <div className="l-hero__bg">
        <div className="l-hero__overlay" />
      </div>
      <HeroBackgroundDecor />

      <div className="l-hero__inner">
        <div>
          <div className="l-hero__badge">
            <span className="l-hero__badge-dot" />
            {OFFER.short}
          </div>

          <h1 className="l-hero__title">
            Компании, которым нужны ваши услуги,{' '}
            <span className="grad-text">— по жалобам их клиентов</span>
          </h1>

          <p className="l-hero__sub">
            Укажите нишу и город. SpinLid найдёт компании на Яндекс.Картах и 2GIS, покажет,
            на что жалуются их клиенты в отзывах, и подготовит черновик письма под каждую жалобу.
          </p>

          <div className="l-hero__actions">
            <button type="button" className="l-btn l-btn--primary" onClick={onCtaRegister}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Попробовать бесплатно
            </button>
            <Link href="/demo" className="l-btn l-btn--ghost">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
              </svg>
              Смотреть пример
            </Link>
          </div>
        </div>

        <div className="l-hero__frame">
          <CompanyCardExample />
        </div>
      </div>

      <a href="#signals" className="l-hero__scroll-hint" aria-label="К примеру выдачи">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </section>
  );
}

/** Статичный кадр карточки компании из кабинета — только иллюстрация, без кнопок. */
function CompanyCardExample() {
  return (
    <figure
      style={{
        width: '100%',
        maxWidth: '420px',
        margin: 0,
        backgroundColor: 'var(--landing-card)',
        color: 'var(--landing-text)',
        borderRadius: 'var(--landing-radius)',
        padding: '20px 22px',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Стоматология «Улыбка+»</div>
          <div style={{ fontSize: '12px', color: 'var(--landing-muted)', marginTop: '2px' }}>
            Москва · ★ 3.8 · 142 отзыва
          </div>
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: '6px',
            background: 'rgba(220, 38, 38, 0.1)',
            color: '#b91c1c',
            whiteSpace: 'nowrap',
          }}
        >
          31 жалоба
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--landing-muted)', marginBottom: '14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Phone size={12} style={{ color: 'var(--landing-accent)' }} aria-hidden />
          +7 (495) 123-45-67
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Mail size={12} style={{ color: 'var(--landing-accent)' }} aria-hidden />
          info@ulybka-plus.ru
        </span>
      </div>

      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: '#b45309',
          marginBottom: '8px',
        }}
      >
        На что жалуются клиенты
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {PAINS.map((p) => (
          <div
            key={p.label}
            style={{
              borderRadius: '8px',
              padding: '9px 11px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>{p.label}</span>
              <span style={{ fontSize: '11px', color: '#b45309' }}>× {p.count}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--landing-text-body)', fontStyle: 'italic', lineHeight: 1.45 }}>
              <MessageSquareQuote size={11} style={{ color: '#b45309', flexShrink: 0, marginTop: '3px' }} aria-hidden />
              <span>«{p.quote}»</span>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '14px',
          padding: '10px 12px',
          borderRadius: '8px',
          background: 'var(--landing-accent-light)',
          fontSize: '12.5px',
          color: 'var(--landing-text)',
          lineHeight: 1.4,
        }}
      >
        <Sparkles size={14} style={{ color: 'var(--landing-accent)', flexShrink: 0 }} aria-hidden />
        <span>
          <strong>Черновик письма:</strong> «Вижу в отзывах 12 жалоб на ожидание — покажу, как это исправить…»
        </span>
      </div>

      <figcaption style={{ marginTop: '12px', fontSize: '11px', color: 'var(--landing-muted)', textAlign: 'center' }}>
        Пример карточки компании в кабинете
      </figcaption>
    </figure>
  );
}
