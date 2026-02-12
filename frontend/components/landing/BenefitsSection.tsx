'use client';

import { Search, Users, Download, Send, FileEdit, History, ArrowRight, ExternalLink } from 'lucide-react';

const BENEFITS = [
  {
    icon: Search,
    title: 'Сбор лидов по ключевым запросам',
    desc: 'Ниша + регион → список компаний и контактов из открытых источников.',
  },
  {
    icon: Users,
    title: 'Фильтры и нормализация контактов',
    desc: 'Телефоны, email, сайт, город — приводим к единому виду, убираем мусор.',
  },
  {
    icon: Download,
    title: 'Экспорт CSV и копирование контактов',
    desc: 'В 1 клик выгрузка в таблицу или копирование выбранных строк.',
    tag: 'CSV',
  },
  {
    icon: Send,
    title: 'Отправка КП и статусы доставки',
    desc: 'Отправляйте коммерческие предложения и смотрите: доставлено / открыто / ошибка.',
    tag: 'КП',
  },
  {
    icon: FileEdit,
    title: 'Редактор КП и шаблоны',
    desc: 'Шаблоны под разные ниши + быстрые правки перед отправкой.',
  },
  {
    icon: History,
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
    <div className="flex items-center justify-between gap-1 rounded-full px-3 py-2 text-xs" style={{ backgroundColor: 'var(--landing-card)', border: '1px solid var(--landing-border)' }}>
      {FUNNEL_STEPS.map((step, i) => (
        <span key={step.label} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2 py-1 font-medium ${step.accent ? '' : ''}`}
            style={step.accent ? { backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' } : { color: 'var(--landing-muted)' }}
          >
            {step.label}
          </span>
          {i < FUNNEL_STEPS.length - 1 && <ArrowRight className="h-3 w-3 shrink-0" style={{ color: 'var(--landing-muted)' }} />}
        </span>
      ))}
    </div>
  );
}

function PseudoUICards() {
  return (
    <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-4">
      {/* Card: Лиды */}
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
          <button type="button" className="mt-2 rounded px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}>CSV</button>
        </div>
      </div>
      {/* Card: КП */}
      <div className="benefits-pseudo-card order-1 sm:order-2 sm:z-10">
        <div
          className="w-full max-w-[180px] rounded-[10px] border px-3 py-2.5 shadow-md"
          style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)', boxShadow: '0 4px 12px rgba(15,23,42,0.08)' }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--landing-muted)' }}>КП</div>
          <div className="mt-1.5 text-[11px]" style={{ color: 'var(--landing-text)' }}>Шаблон КП</div>
          <button type="button" className="mt-1.5 rounded px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--landing-accent)', color: '#fff' }}>Отправить</button>
          <div className="mt-1 text-[10px]" style={{ color: 'var(--landing-muted)' }}>В обработке</div>
        </div>
      </div>
      {/* Card: Статусы */}
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
    <section id="benefits" className="landing-section py-12 md:py-14 lg:py-16">
      <div className="container max-w-[72rem]">
        <div className="grid gap-10 lg:grid-cols-[55%_1fr] lg:gap-12 lg:items-start">
          {/* Left: text */}
          <div className="max-w-[560px] lg:max-w-[640px]">
            <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>
              Что вы получите
            </h2>
            <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>
              Собирайте лиды по запросам, работайте с контактами, отправляйте КП и следите за статусами — всё в одном кабинете.
            </p>
            <ul className="mt-6 space-y-3 sm:space-y-4">
              {BENEFITS.map(({ icon: Icon, title, desc, tag }) => (
                <li key={title} className="flex gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--landing-radius)]"
                    style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--landing-text)' }}>
                      {title}
                      {tag && (
                        <span className="ml-1.5 text-xs font-medium" style={{ color: 'var(--landing-accent)' }}>({tag})</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug" style={{ color: 'var(--landing-muted)' }}>{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs" style={{ color: 'var(--landing-muted)' }}>
              SEO и госзакупки — в том же кабинете.
            </p>
            {/* CTA */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#register"
                className="inline-flex items-center gap-2 rounded-[var(--landing-radius)] px-4 py-2.5 text-sm font-semibold transition-colors hover:opacity-90"
                style={{ backgroundColor: 'var(--landing-accent)', color: '#fff' }}
              >
                Создать аккаунт
              </a>
              <a
                href="#examples"
                className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                style={{ color: 'var(--landing-accent)' }}
              >
                Посмотреть пример результата
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--landing-muted)' }}>
              Без карты • регистрация ~30 секунд
            </p>
          </div>

          {/* Right: infographic */}
          <div className="lg:pt-2">
            <MiniFunnel />
            <PseudoUICards />
          </div>
        </div>
      </div>
    </section>
  );
}
