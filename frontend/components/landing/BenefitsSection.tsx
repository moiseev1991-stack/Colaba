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

const STATS = [
  { value: '50K+', label: 'Контактов собрано' },
  { value: '89%', label: 'Доставляемость' },
  { value: '24/7', label: 'Автоматизация' },
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
      {STATS.map((stat) => (
        <div
          key={stat.label}
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
              fontSize: '24px',
              fontWeight: 800,
              background: 'var(--landing-grad-accent)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {stat.value}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--landing-muted)', marginTop: '4px' }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function PseudoUICards() {
  return (
    <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
      <div className="benefits-pseudo-card order-2 sm:order-1">
        <div
          className="w-full max-w-[200px] rounded-[12px] border px-4 py-3 shadow-sm sm:-rotate-2 sm:translate-y-1"
          style={{ backgroundColor: 'var(--landing-bg)', borderColor: 'var(--landing-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-muted)' }}>Лиды</div>
          <div className="mt-2 space-y-1.5 text-[12px]" style={{ color: 'var(--landing-text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>ООО «Технолоджи»</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--landing-accent)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>ИП Иванов</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--landing-accent)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>АО «Строй»</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#94a3b8' }} />
            </div>
          </div>
          <button
            type="button"
            className="mt-3 rounded px-3 py-1 text-[11px] font-medium"
            style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
          >
            Экспорт CSV
          </button>
        </div>
      </div>
      <div className="benefits-pseudo-card order-1 sm:order-2 sm:z-10">
        <div
          className="w-full max-w-[200px] rounded-[12px] border px-4 py-3 shadow-lg"
          style={{
            backgroundColor: 'var(--landing-bg)',
            borderColor: 'var(--landing-accent)',
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-accent)' }}>Отправка КП</div>
          <div className="mt-2 text-[12px]" style={{ color: 'var(--landing-text)' }}>
            <div style={{ marginBottom: '8px' }}>Шаблон: «Услуги B2B»</div>
            <div style={{ fontSize: '11px', color: 'var(--landing-muted)' }}>Получателей: 127</div>
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded px-3 py-1.5 text-[11px] font-semibold"
            style={{ backgroundColor: 'var(--landing-accent)', color: '#fff' }}
          >
            Запустить рассылку
          </button>
        </div>
      </div>
      <div className="benefits-pseudo-card order-3">
        <div
          className="w-full max-w-[200px] rounded-[12px] border px-4 py-3 shadow-sm sm:rotate-2 sm:-translate-y-1"
          style={{ backgroundColor: 'var(--landing-bg)', borderColor: 'var(--landing-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-muted)' }}>Статусы</div>
          <div className="mt-2 space-y-1.5">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--landing-accent)' }} />
              <span style={{ color: 'var(--landing-text)' }}>Доставлено</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--landing-accent)' }}>98</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e' }} />
              <span style={{ color: 'var(--landing-text)' }}>Открыто</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#22c55e' }}>43</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }} />
              <span style={{ color: 'var(--landing-text)' }}>Ошибка</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#ef4444' }}>2</span>
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
            <StatsRow />
          </div>
        </div>
      </div>
    </section>
  );
}
