import { Search, Users, FileText } from 'lucide-react';

const MODULES = [
  {
    icon: Search,
    title: 'SEO-аудит и парсинг',
    bullets: ['запрос → выдача → домены', 'мета/robots/sitemap', 'экспорт'],
  },
  {
    icon: Users,
    title: 'Поиск лидов',
    bullets: ['компании и контакты', 'быстрая выгрузка', 'история запросов'],
  },
  {
    icon: FileText,
    title: 'Госзакупки',
    bullets: ['поиск тендеров', 'фильтры', 'история и мониторинг'],
  },
];

export function ModulesSection() {
  return (
    <section id="features" className="py-16 md:py-20">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>Возможности</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>Три модуля в одном кабинете</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {MODULES.map(({ icon: Icon, title, bullets }) => (
            <div
              key={title}
              className="rounded-[12px] border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--landing-accent)]/30"
              style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--landing-radius)]" style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold" style={{ color: 'var(--landing-text)' }}>{title}</h3>
              <ul className="mt-3 space-y-1.5 text-sm" style={{ color: 'var(--landing-muted)' }}>
                {bullets.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
              <a href="#examples" className="mt-4 inline-flex items-center text-sm font-medium hover:underline" style={{ color: 'var(--landing-accent)' }}>
                Подробнее →
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
