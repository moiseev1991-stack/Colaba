// ТЗ лендинг-рефакта 2026-06-03 §6: ушли от перечня «4 модуля» как главного
// посыла. Теперь раздел продаёт связку «диагноз → письмо → отправка»,
// SEO-аудит и Госзакупки убраны из верха (они есть в кабинете, но не продают
// суть). Шесть карточек — все про главную фишку: компании → отзывы → боли
// → черновик → отправка → история.

const MODULES = [
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
    title: 'Поиск компаний на картах',
    desc: 'Ниша + город → реальные карточки из 2GIS и Яндекс.Карт: название, рейтинг, телефоны, сайт, адрес.',
    bullets: ['12 подмосковных городов с фильтром-сателлитом', 'Playwright тащит контакты со страницы 2GIS', 'Фильтры по рейтингу, негативу, наличию сайта'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'AI-диагноз из отзывов',
    desc: 'Отзывы клиентов проходят через AI: на каждой компании — топ-3 боли с количеством упоминаний и цитатой-доказательством.',
    bullets: ['Кластеризация болей по нише', 'Цитаты клиентов под каждым тегом', 'AI-температура лида 0-100'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2v6m0 0l-3-3m3 3l3-3M3 12h6m0 0l-3-3m3 3l-3 3M21 12h-6m0 0l3 3m-3-3l3-3M12 22v-6m0 0l3 3m-3-3l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Письмо под боль одним кликом',
    desc: 'AI генерирует черновик: «вижу в отзывах жалобу на X, могу показать решение» — с упоминанием конкретной цитаты.',
    bullets: ['Шаблоны под нишу и тон письма', 'Регенерация и ручная правка', 'Bulk-драфты на весь список'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" />
        <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Email-кампании и статусы',
    desc: 'Запускайте рассылки по выбранным компаниям. В реальном времени — кто получил, открыл, кликнул, не доставлено.',
    bullets: ['SMTP или Hyvor Relay', 'Доставлено / Открыто / Кликнул / Ошибка', 'Ответы — в одном ящике через catch-all'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 8h6M9 12h6M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Юр.данные и платёжеспособность',
    desc: 'DaData подтягивает ИНН, ОГРН, оборот за последний год и возраст компании. Фильтр «платёжеспособные».',
    bullets: ['Бесплатно через DaData', 'Бейдж «оборот ~N млн ₽ · открыта X лет»', 'Фильтр по возрасту и обороту'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'История, пресеты, экспорт',
    desc: 'Сохранённые фильтры (включая «свой AI-промпт»), повтор удачных поисков, экспорт в Excel и CSV.',
    bullets: ['Свои пресеты с AI-скорингом', 'Excel «лиды на сайт» — 2 вкладки', 'Карты + фильтр источника 2GIS/Я.Карты'],
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
        <p
          className="reveal"
          style={{
            marginTop: '32px',
            textAlign: 'center',
            fontSize: '13px',
            color: 'var(--landing-muted)',
          }}
        >
          В кабинете также есть SEO-аудит сайтов и мониторинг госзакупок —
          но главная фишка SpinLid здесь, выше.
        </p>
      </div>
    </section>
  );
}
