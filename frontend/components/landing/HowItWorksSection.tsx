import { MapPin, Users, Filter, Send } from 'lucide-react';

const STEPS = [
  { icon: MapPin, title: 'Выберите нишу и регион' },
  { icon: Users, title: 'Соберите лидов и контакты' },
  { icon: Filter, title: 'Отфильтруйте и выберите получателей' },
  { icon: Send, title: 'Отправьте КП и получите статусы + экспорт' },
];

export function HowItWorksSection() {
  return (
    <section id="how" className="landing-section">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-[30px]" style={{ color: 'var(--landing-text)' }}>
          Как это работает
        </h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>
          От сбора лидов до отправки КП — 4 шага
        </p>
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title }, i) => (
            <div key={i} className="flex flex-col items-center text-center">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
              >
                <Icon className="h-6 w-6" />
              </div>
              <span className="mt-3 text-xs font-semibold" style={{ color: 'var(--landing-accent)' }}>Шаг {i + 1}</span>
              <h3 className="mt-1 font-semibold" style={{ color: 'var(--landing-text)' }}>
                {title}
              </h3>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm" style={{ color: 'var(--landing-muted)' }}>
          На выходе: таблица → фильтры → экспорт → история запусков
        </p>
      </div>
    </section>
  );
}
