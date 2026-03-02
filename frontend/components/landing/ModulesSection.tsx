const MODULES = [
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Поиск лидов',
    desc: 'Собирайте базы компаний по ключевым запросам, нишам и регионам из открытых источников.',
    bullets: ['Компании, сайты, телефоны, почты', 'Фильтры: город, отрасль, тип контактов', 'Экспорт CSV в 1 клик'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" />
        <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Отправка КП',
    desc: 'Шаблоны коммерческих предложений, кампании рассылок и детальные статусы доставки.',
    bullets: ['Шаблоны и выбор получателей', 'Кампании рассылок КП', 'Статусы: отправлено / открыто / ошибка'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'SEO-аудит',
    desc: 'Проверяйте домены, извлекайте контакты с сайтов, анализируйте техническое состояние.',
    bullets: ['Robots, sitemap, meta-теги', 'Контакты с сайтов', 'Экспорт и история'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Госзакупки',
    desc: 'Мониторинг тендеров по вашим параметрам: регион, цена, тип заказчика.',
    bullets: ['Поиск тендеров по параметрам', 'Фильтры по региону и сумме', 'Мониторинг и история'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Фильтры и нормализация',
    desc: 'Телефоны, email, сайт, город — приводим к единому виду, убираем дубли и мусор.',
    bullets: ['Умная очистка контактов', 'Дедупликация базы', 'Blacklist по доменам'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'История и аналитика',
    desc: 'Возвращайтесь к прошлым запускам, повторяйте успешные кампании, отслеживайте динамику.',
    bullets: ['История всех запусков', 'Статистика кампаний КП', 'Экспорт отчётов'],
  },
];

export function ModulesSection() {
  return (
    <section id="features" className="landing-section l-skills">
      <div className="container">
        <div className="section-label reveal">Возможности</div>
        <h2 className="section-title reveal">
          Что умеет <span className="accent" style={{ color: 'var(--landing-accent)' }}>SpinLid</span>
        </h2>
        <div className="l-skills__grid">
          {MODULES.map(({ svg, title, desc, bullets }) => (
            <div className="l-skill-card reveal" key={title}>
              <div className="l-skill-card__icon">{svg}</div>
              <h3>{title}</h3>
              <p>{desc}</p>
              <ul>
                {bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
