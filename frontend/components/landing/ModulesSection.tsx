// Секция 5 главной «Что внутри» (PR 2.2): шесть возможностей простым языком —
// без внутренних терминов вроде «AI-температура лида» и «свой AI-промпт».

const MODULES = [
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
    title: 'Поиск компаний на картах',
    desc: 'Ниша и город — и вы получаете компании с Яндекс.Карт и 2GIS: название, рейтинг, телефон, сайт, адрес.',
    bullets: ['Москва, Санкт-Петербург и другие города', 'Телефоны, сайты и мессенджеры из карточек', 'Фильтры по рейтингу, жалобам и наличию сайта'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Жалобы клиентов из отзывов',
    desc: 'AI читает отзывы и показывает главные жалобы по каждой компании — сколько раз о них пишут и цитату.',
    bullets: ['Жалобы сгруппированы по темам', 'Цитата клиента под каждой жалобой', 'Видно, каким компаниям помощь нужна больше'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Черновик письма в один клик',
    desc: 'Письмо начинается с конкретной жалобы из отзывов, а не с «Здравствуйте, мы предлагаем».',
    bullets: ['Шаблоны под нишу и тон письма', 'Можно перегенерировать или поправить руками', 'Черновики сразу на весь список'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Списки и выгрузка',
    desc: 'Собирайте компании в списки и выгружайте в Excel или CSV — для CRM, обзвона или своей почты.',
    bullets: ['Списки по нишам и городам', 'Excel и CSV в один клик', 'Письмо — скопировать в свою почту'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 8h6M9 12h6M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Данные о компании',
    desc: 'ИНН, оборот и возраст компании из открытых реестров — чтобы писать тем, кто может заплатить.',
    bullets: ['Оборот и возраст рядом с карточкой', 'Фильтр по обороту и возрасту', 'Только открытые источники'],
  },
  {
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'История и сохранённые фильтры',
    desc: 'Повторяйте удачные поиски в один клик и храните свои наборы фильтров.',
    bullets: ['История всех поисков', 'Сохранённые наборы фильтров', 'Результаты не пропадают'],
  },
];

export function ModulesSection() {
  return (
    <section id="features" className="landing-section l-skills">
      <div className="container">
        <div className="section-label reveal">Возможности</div>
        <h2 className="section-title reveal">
          Что <span style={{ color: 'var(--landing-accent)' }}>внутри</span>
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
