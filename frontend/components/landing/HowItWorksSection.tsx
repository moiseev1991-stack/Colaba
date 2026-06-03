// ТЗ лендинг-рефакта 2026-06-03 §6: 4 шага переориентированы с «парсера контактов»
// на «диагноз → письмо». Старая логика «фильтры → blacklist → CSV → статусы» —
// тоже есть в продукте, но не она продаёт.

const STEPS = [
  {
    num: '01',
    title: 'Выберите нишу и город',
    desc: 'Например, «стоматология / Москва» или «автосервис / Балашиха». Системы 2GIS и Яндекс.Карты подгрузят реальные карточки.',
  },
  {
    num: '02',
    title: 'AI читает отзывы и ставит диагноз',
    desc: 'На каждую компанию — топ-3 болей с количеством упоминаний и цитатами клиентов. Не «3.8★», а конкретно: «жалуются на ожидание × 12».',
  },
  {
    num: '03',
    title: 'Получите письмо под каждую боль',
    desc: 'Один клик — готовый черновик: «вижу в отзывах жалобу на X, могу показать решение». С упоминанием конкретной цитаты, не «здравствуйте».',
  },
  {
    num: '04',
    title: 'Отправьте кампанию и смотрите статусы',
    desc: 'Запустите рассылку и смотрите в реальном времени: доставлено / открыто / кликнул / ошибка. Ответы — в одном ящике.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how" className="landing-section l-how">
      <div className="container">
        <div className="section-label reveal">Как это работает</div>
        <h2 className="section-title reveal">
          От ниши до письма — <span style={{ color: 'var(--landing-accent)' }}>4 шага</span>
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
          На выходе: карточки с диагнозом → черновики писем → кампания → статусы доставки
        </p>
      </div>
    </section>
  );
}
