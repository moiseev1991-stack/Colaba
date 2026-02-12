import { Check, Zap, FileSpreadsheet, Users } from 'lucide-react';
import { QuickSignup } from './QuickSignup';

const BENEFITS = [
  {
    icon: Users,
    title: 'Сбор лидов по нише и региону',
    desc: 'Контакты компаний из открытых источников',
  },
  {
    icon: FileSpreadsheet,
    title: 'Экспорт CSV и копирование контактов',
    desc: 'Быстрая выгрузка в таблицы',
  },
  {
    icon: Zap,
    title: 'Отправка КП и статусы доставки',
    desc: 'Кампании, шаблоны, аналитика',
  },
  {
    icon: Check,
    title: 'История запусков и результатов',
    desc: 'Всё в одном кабинете',
  },
];

export function RegisterSection() {
  return (
    <section
      id="register"
      className="relative overflow-hidden landing-section"
      style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.03) 0%, transparent 50%, rgba(224, 231, 255, 0.2) 100%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />
      <div className="container register-section-container relative z-10">
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-medium mb-3"
          style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
        >
          Регистрация
        </span>
        <h2 className="text-2xl font-extrabold md:text-[28px] lg:text-[30px]" style={{ color: 'var(--landing-text)' }}>
          Начните за 1 минуту
        </h2>
        <p className="mt-2 text-sm md:text-base max-w-[680px] opacity-75" style={{ color: 'var(--landing-text)' }}>
          Соберите лиды, отправьте КП и получите статусы. SEO и госзакупки — в том же кабинете.
        </p>
        <div className="mt-8 lg:mt-12 grid gap-8 lg:gap-12 lg:grid-cols-[440px_1fr] lg:items-start">
          <div
            className="w-full max-w-[460px] mx-auto lg:mx-0 rounded-[18px] border p-6 lg:p-7"
            style={{
              backgroundColor: 'var(--landing-card)',
              borderColor: 'rgba(15, 23, 42, 0.08)',
              boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
            }}
          >
            <h3 className="text-base font-semibold" style={{ color: 'var(--landing-text)' }}>Создайте аккаунт</h3>
            <p className="mt-1 text-xs" style={{ color: 'var(--landing-muted)' }}>~30 секунд, без карты</p>
            <div className="mt-5">
              <QuickSignup />
            </div>
          </div>
          <div className="max-w-[520px] lg:max-w-none">
            <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--landing-text)' }}>Что вы получите</h3>
            <ul className="space-y-4">
              {BENEFITS.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="flex gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--landing-text)' }}>{title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--landing-muted)' }}>{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
