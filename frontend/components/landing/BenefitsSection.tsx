'use client';

import { ArrowRight } from 'lucide-react';

// ТЗ лендинг-рефакта 2026-06-03 §3+§6: переориентация с «парсера контактов»
// на «диагноз → письмо → отправка». 6 benefits переписаны под главную фишку,
// StatsRow с выдуманными 50K+/89%/24-7 заменена на честные продуктовые факты.

const BENEFITS = [
  {
    title: 'Компании из 2GIS и Яндекс.Карт',
    desc: 'Ниша + город → реальные карточки с рейтингом, отзывами, телефонами и сайтами.',
  },
  {
    title: 'Диагноз из отзывов AI',
    desc: 'Отзывы клиентов проходят через AI: на каждой компании — топ-3 боли с количеством упоминаний.',
  },
  {
    title: 'Цитаты-доказательства',
    desc: 'Под каждой болью — конкретные слова клиента из отзыва. Не статистика, а живой текст.',
  },
  {
    title: 'Черновик письма под боль',
    desc: 'Один клик — готовый текст: вместо «здравствуйте» — упоминание конкретной жалобы клиента.',
  },
  {
    title: 'Лиды без своего сайта',
    desc: 'Отдельный фильтр: компании без работающего сайта — горячие лиды для веб-студий и SMM.',
  },
  {
    title: 'Юр.данные и температура лида',
    desc: 'Оборот, возраст, ИНН (DaData) и AI-оценка готовности купить — на каждую карточку.',
  },
];

const FUNNEL_STEPS = [
  { label: 'Ниша + город', accent: false },
  { label: 'Компании', accent: false },
  { label: 'Боли', accent: true },
  { label: 'Письмо', accent: true },
];

function MiniFunnel() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '4px',
        borderRadius: '40px',
        padding: '10px 20px',
        backgroundColor: 'var(--landing-card)',
        border: '1px solid var(--landing-border)',
        fontSize: '12px',
      }}
    >
      {FUNNEL_STEPS.map((step, i) => (
        <span key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              borderRadius: '40px',
              padding: '4px 10px',
              fontWeight: 600,
              backgroundColor: step.accent ? 'var(--landing-accent-soft)' : 'transparent',
              color: step.accent ? 'var(--landing-accent)' : 'var(--landing-muted)',
            }}
          >
            {step.label}
          </span>
          {i < FUNNEL_STEPS.length - 1 && (
            <ArrowRight size={12} style={{ color: 'var(--landing-dim)', flexShrink: 0 }} />
          )}
        </span>
      ))}
    </div>
  );
}

// Честные продуктовые факты вместо несуществующей клиентской статистики
const FACTS = [
  { value: '2GIS', label: 'основной источник' },
  { value: 'AI', label: 'анализ отзывов' },
  { value: '500 / мес', label: 'бесплатно' },
];

function StatsRow() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginTop: '24px',
      }}
    >
      {FACTS.map((fact) => (
        <div
          key={fact.label}
          style={{
            textAlign: 'center',
            padding: '16px 12px',
            borderRadius: '12px',
            backgroundColor: 'var(--landing-bg)',
            border: '1px solid var(--landing-border)',
          }}
        >
          <div
            style={{
              fontSize: '20px',
              fontWeight: 800,
              background: 'var(--landing-grad-accent)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {fact.value}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--landing-muted)', marginTop: '4px' }}>
            {fact.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// Демо-карточка → теперь pain-теги + цитата + кнопка «Письмо», а не «Лиды/КП/Статусы»
function PseudoUICards() {
  return (
    <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
      <div className="benefits-pseudo-card order-2 sm:order-1">
        <div
          className="w-full max-w-[210px] rounded-[12px] border px-4 py-3 shadow-sm sm:-rotate-2 sm:translate-y-1"
          style={{ backgroundColor: 'var(--landing-bg)', borderColor: 'var(--landing-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-muted)' }}>Компания</div>
          <div className="mt-2 space-y-1 text-[12px]" style={{ color: 'var(--landing-text)' }}>
            <div style={{ fontWeight: 600 }}>Стоматология «Улыбка+»</div>
            <div style={{ fontSize: '11px', color: 'var(--landing-muted)' }}>
              ★ 3.8 · 142 отзыва · 31 негатив
            </div>
          </div>
          <div
            className="mt-2 rounded-[6px] px-2 py-1"
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#d97706' }}>
              Долгое ожидание × 12
            </div>
            <div style={{ fontSize: '10.5px', marginTop: 2, fontStyle: 'italic', color: 'var(--landing-muted)' }}>
              «Записала ребёнка на 10, приняли в 11:20…»
            </div>
          </div>
        </div>
      </div>
      <div className="benefits-pseudo-card order-1 sm:order-2 sm:z-10">
        <div
          className="w-full max-w-[220px] rounded-[12px] border px-4 py-3 shadow-lg"
          style={{
            backgroundColor: 'var(--landing-bg)',
            borderColor: 'var(--landing-accent)',
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-accent)' }}>Письмо под боль</div>
          <div className="mt-2 text-[11.5px]" style={{ color: 'var(--landing-text)', lineHeight: 1.45 }}>
            «Здравствуйте! Вижу в отзывах, что у клиентов жалоба
            на долгое ожидание — могу показать, как это решить онлайн-записью…»
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded px-3 py-1.5 text-[11px] font-semibold"
            style={{ backgroundColor: 'var(--landing-accent)', color: '#fff' }}
          >
            Отправить
          </button>
        </div>
      </div>
      <div className="benefits-pseudo-card order-3">
        <div
          className="w-full max-w-[200px] rounded-[12px] border px-4 py-3 shadow-sm sm:rotate-2 sm:-translate-y-1"
          style={{ backgroundColor: 'var(--landing-bg)', borderColor: 'var(--landing-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-muted)' }}>Юр.данные</div>
          <div className="mt-2 space-y-1.5 text-[12px]" style={{ color: 'var(--landing-text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--landing-muted)' }}>Возраст</span>
              <span style={{ fontWeight: 600 }}>5 лет</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--landing-muted)' }}>Оборот</span>
              <span style={{ fontWeight: 600 }}>~ 1.2 млн ₽</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--landing-muted)' }}>Температура</span>
              <span style={{ fontWeight: 600, color: 'var(--landing-accent)' }}>🔥 73</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BenefitsSection() {
  return (
    <section id="benefits" className="landing-section" style={{ background: 'var(--landing-card)' }}>
      <div className="container" style={{ maxWidth: '1160px' }}>
        <div
          style={{
            display: 'grid',
            gap: '48px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            alignItems: 'start',
          }}
        >
          {/* Left: text */}
          <div>
            <div className="section-label reveal">Что входит</div>
            <h2
              className="reveal"
              style={{
                fontSize: 'clamp(26px, 3vw, 36px)',
                fontWeight: 800,
                color: 'var(--landing-text)',
                marginBottom: '8px',
                letterSpacing: '-0.5px',
              }}
            >
              Полный цикл: ниша → диагноз → письмо
            </h2>
            <p className="reveal" style={{ color: 'var(--landing-muted)', marginBottom: '28px', fontSize: '15px' }}>
              Apollo показывает, кому писать. SpinLid — что написать и почему откликнутся.
            </p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {BENEFITS.map(({ title, desc }) => (
                <li key={title} className="reveal" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--landing-grad-accent)',
                      flexShrink: 0,
                      marginTop: '7px',
                    }}
                  />
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--landing-text)', marginBottom: '2px' }}>{title}</p>
                    <p style={{ fontSize: '13px', color: 'var(--landing-muted)', lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="reveal" style={{ marginTop: '32px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <a
                href="#register"
                className="l-btn l-btn--primary"
                style={{ fontSize: '14px', padding: '11px 22px' }}
              >
                Создать аккаунт
              </a>
              <a
                href="#examples"
                style={{ fontSize: '14px', fontWeight: 600, color: 'var(--landing-accent)', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                Посмотреть демо →
              </a>
            </div>
          </div>

          {/* Right: infographic */}
          <div className="reveal" style={{ paddingTop: '8px' }}>
            <MiniFunnel />
            <PseudoUICards />
            <StatsRow />
          </div>
        </div>
      </div>
    </section>
  );
}
