'use client';

import { ArrowRight } from 'lucide-react';

const BENEFITS = [
  {
    title: 'Сбор лидов по ключевым запросам',
    desc: 'Ниша + регион → список компаний и контактов из открытых источников.',
  },
  {
    title: 'Фильтры и нормализация контактов',
    desc: 'Телефоны, email, сайт, город — приводим к единому виду, убираем мусор.',
  },
  {
    title: 'Экспорт CSV и копирование',
    desc: 'В 1 клик выгрузка в таблицу или копирование выбранных строк.',
  },
  {
    title: 'Отправка КП и статусы доставки',
    desc: 'Отправляйте коммерческие предложения и смотрите: доставлено / открыто / ошибка.',
  },
  {
    title: 'Редактор КП и шаблоны',
    desc: 'Шаблоны под разные ниши + быстрые правки перед отправкой.',
  },
  {
    title: 'История лидов и запусков',
    desc: 'Возвращайтесь к прошлым выгрузкам, повторяйте удачные сценарии.',
  },
];

const FUNNEL_STEPS = [
  { label: 'Запрос', accent: false },
  { label: 'Лиды', accent: false },
  { label: 'КП', accent: true },
  { label: 'Статусы', accent: true },
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

function PseudoUICards() {
  return (
    <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-4">
      <div className="benefits-pseudo-card order-2 sm:order-1">
        <div
          className="w-full max-w-[180px] rounded-[10px] border px-3 py-2.5 shadow-sm sm:-rotate-2 sm:translate-y-1"
          style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-muted)' }}>Лиды</div>
          <div className="mt-1.5 space-y-0.5 text-[11px]" style={{ color: 'var(--landing-text)' }}>
            <div>Company / Email / Phone</div>
            <div>…</div>
            <div>…</div>
          </div>
          <button
            type="button"
            className="mt-2 rounded px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
          >
            CSV
          </button>
        </div>
      </div>
      <div className="benefits-pseudo-card order-1 sm:order-2 sm:z-10">
        <div
          className="w-full max-w-[180px] rounded-[10px] border px-3 py-2.5 shadow-md"
          style={{
            backgroundColor: 'var(--landing-card)',
            borderColor: 'var(--landing-border)',
            boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-muted)' }}>КП</div>
          <div className="mt-1.5 text-[11px]" style={{ color: 'var(--landing-text)' }}>Шаблон КП</div>
          <button
            type="button"
            className="mt-1.5 rounded px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: 'var(--landing-accent)', color: '#fff' }}
          >
            Отправить
          </button>
          <div className="mt-1 text-[10px]" style={{ color: 'var(--landing-muted)' }}>В обработке</div>
        </div>
      </div>
      <div className="benefits-pseudo-card order-3">
        <div
          className="w-full max-w-[180px] rounded-[10px] border px-3 py-2.5 shadow-sm sm:rotate-2 sm:-translate-y-1"
          style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-muted)' }}>Статусы</div>
          <div className="mt-1.5 flex flex-wrap gap-0.5 text-[10px]">
            <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}>Доставлено</span>
            <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}>Открыто</span>
            <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--landing-danger)' }}>Ошибка</span>
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
            <div className="section-label reveal">Что вы получите</div>
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
              Полный цикл B2B-продаж
            </h2>
            <p className="reveal" style={{ color: 'var(--landing-muted)', marginBottom: '28px', fontSize: '15px' }}>
              Собирайте лиды, отправляйте КП и следите за статусами — всё в одном кабинете.
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
                Посмотреть пример →
              </a>
            </div>
          </div>

          {/* Right: infographic */}
          <div className="reveal" style={{ paddingTop: '8px' }}>
            <MiniFunnel />
            <PseudoUICards />
          </div>
        </div>
      </div>
    </section>
  );
}
