const STEPS = [
  {
    num: '01',
    title: 'Выберите нишу и регион',
    desc: 'Укажите запрос, отрасль и географию — система найдёт компании из открытых источников.',
  },
  {
    num: '02',
    title: 'Соберите лидов и контакты',
    desc: 'Получите список с телефонами, email и сайтами, нормализованными и готовыми к работе.',
  },
  {
    num: '03',
    title: 'Отфильтруйте получателей',
    desc: 'Выберите нужные записи, исключите конкурентов через blacklist, выгрузите CSV.',
  },
  {
    num: '04',
    title: 'Отправьте КП и следите за статусами',
    desc: 'Запустите кампанию рассылки — в реальном времени смотрите: доставлено / открыто / ошибка.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how" className="landing-section l-how">
      <div className="container">
        <div className="section-label reveal">Как это работает</div>
        <h2 className="section-title reveal">
          От запроса до КП — <span style={{ color: 'var(--landing-accent)' }}>4 шага</span>
        </h2>
        <div className="l-how__grid">
          {STEPS.map(({ num, title, desc }) => (
            <div className="l-how__step reveal" key={num}>
              <div className="l-how__step-num">{num}</div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
        <p
          className="reveal"
          style={{
            marginTop: '48px',
            textAlign: 'center',
            fontSize: '14px',
            color: 'var(--landing-muted)',
          }}
        >
          На выходе: таблица → фильтры → экспорт CSV → история запусков
        </p>
      </div>
    </section>
  );
}
