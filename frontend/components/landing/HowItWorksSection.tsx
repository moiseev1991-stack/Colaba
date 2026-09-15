// Секция 3 главной (PR 2.2): процесс объясняется один раз и в три шага.
// Раньше он повторялся в трёх блоках: «Диагноз», «Полный цикл» и «4 шага».

const STEPS = [
  {
    num: '1',
    title: 'Выберите нишу и город',
    desc: 'Например, «стоматология, Москва». SpinLid соберёт компании с Яндекс.Карт и 2GIS: название, рейтинг, телефон, сайт.',
  },
  {
    num: '2',
    title: 'Посмотрите, на что жалуются клиенты',
    desc: 'AI читает отзывы и группирует жалобы: «долгое ожидание × 12», «не перезванивают × 5» — с цитатами из отзывов.',
  },
  {
    num: '3',
    title: 'Напишите с поводом',
    desc: 'Один клик — черновик письма с конкретной жалобой. Отправляете сами: из своей почты или CRM, или выгружаете список в Excel.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how" className="landing-section l-how">
      <div className="container">
        <div className="section-label reveal">Как это работает</div>
        <h2 className="section-title reveal">
          Три шага <span style={{ color: 'var(--landing-accent)' }}>до письма</span>
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
      </div>
    </section>
  );
}
