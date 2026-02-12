import { Search, Users, Mail, FileText } from 'lucide-react';

const MODULES = [
  {
    icon: Users,
    title: 'Поиск лидов',
    badge: 'Основное',
    bullets: ['Компании, сайты, телефоны, почты', 'Фильтры: город, отрасль, наличие контактов', 'Экспорт CSV и копирование'],
  },
  {
    icon: Mail,
    title: 'Отправка КП',
    badge: 'Основное',
    bullets: ['Шаблоны и выбор получателей', 'Кампании рассылок', 'Статусы: отправлено / открыто / ошибка'],
  },
  {
    icon: Search,
    title: 'SEO-аудит',
    badge: null,
    bullets: ['Домены, robots, sitemap, meta', 'Контакты с сайтов', 'Экспорт CSV'],
  },
  {
    icon: FileText,
    title: 'Госзакупки',
    badge: null,
    bullets: ['Поиск тендеров по параметрам', 'Фильтры по региону и цене', 'Мониторинг и история'],
  },
];

export function ModulesSection() {
  return (
    <section id="features" className="landing-section">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>Возможности</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>Лиды, КП, SEO и госзакупки в одном кабинете</p>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {MODULES.map(({ icon: Icon, title, badge, bullets }) => (
            <div
              key={title}
              className="rounded-[12px] border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--landing-accent)]/30"
              style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--landing-radius)] shrink-0" style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}>
                  <Icon className="h-5 w-5" />
                </div>
                {badge && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
                  >
                    {badge}
                  </span>
                )}
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
