// Тарифы — обновление 2026-06-12: метрика тарифа теперь «поиски и КП»
// (а не абстрактные «лиды»), названия выровнены с биллингом: Free / Start /
// Pro / Agency. Цены — старые (биллинг ещё не задеплоен, ТЗ §4 разрешает
// держать старые до релиза эпика E). Сетка пока 3 карточки, четвёртая
// Agency встанет когда биллинг будет готов — пока бывший Team используем
// под Agency-позицию.

const PLANS = [
  {
    name: 'Free',
    amount: '0 ₽',
    period: '/мес',
    featured: false,
    badge: null,
    hint: 'Чтобы попробовать на своей нише и убедиться',
    bullets: [
      '1 полный поиск ниши + город',
      '5 КП под боль клиентов из отзывов',
      '1 источник: 2GIS',
      'AI-анализ отзывов: топ-3 болей на карточку',
      'Экспорт CSV',
    ],
    ctaLabel: 'Создать аккаунт',
    ctaStyle: 'outline',
  },
  {
    name: 'Pro',
    amount: '1 990 ₽',
    period: '/мес',
    featured: true,
    badge: 'Популярный',
    hint: 'Окупается первой же закрытой сделкой',
    bullets: [
      'До 50 поисков и 500 КП в месяц',
      '2GIS + Яндекс.Карты, склейка дублей',
      'ЛПР-контакты (DaData + краулер /team)',
      'Все форматы экспорта: CSV, Excel, лиды на сайт',
      'Тренды и benchmark в КП',
      'История 90 дней · приоритет очереди',
    ],
    ctaLabel: 'Создать аккаунт',
    ctaStyle: 'primary',
  },
  {
    name: 'Agency',
    amount: '6 900 ₽',
    period: '/мес',
    featured: false,
    badge: null,
    hint: 'Для агентств: один инструмент — несколько клиентов',
    bullets: [
      'До 200 поисков и 2 000 КП в месяц',
      'Командный доступ, роли',
      'Свои шаблоны КП и приоритет очереди',
      'История 365 дней',
      'CRM-выгрузка (когда будет)',
      'Персональный менеджер',
    ],
    ctaLabel: 'Обсудить условия',
    ctaStyle: 'outline',
  },
];

export function PricingSection({ onCta }: { onCta: () => void }) {
  return (
    <section id="pricing" className="landing-section l-pricing">
      <div className="container">
        <div className="section-label reveal">Цены</div>
        <h2 className="section-title text-center reveal">
          Простые тарифы <span style={{ color: 'var(--landing-accent)' }}>без сюрпризов</span>
        </h2>
        <p
          className="reveal"
          style={{
            textAlign: 'center',
            fontSize: '14px',
            color: 'var(--landing-muted)',
            marginTop: '-8px',
            marginBottom: '32px',
            maxWidth: '640px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          AI-анализ отзывов и КП под боль входят во все тарифы — это главная
          фишка SpinLid, а не платный апгрейд. Один клиент, которого принесут
          100 КП, окупает Pro на год вперёд.
        </p>
        <div className="l-pricing__grid">
          {PLANS.map(({ name, amount, period, featured, badge, hint, bullets, ctaLabel, ctaStyle }) => (
            <div
              key={name}
              className={`l-pricing-card reveal${featured ? ' l-pricing-card--featured' : ''}`}
            >
              {badge && (
                <div className="l-pricing-card__badge">{badge}</div>
              )}
              <div className="l-pricing-card__name">{name}</div>
              <div className="l-pricing-card__price">
                <span
                  className="l-pricing-card__amount"
                  style={amount.length > 6 ? { fontSize: '32px' } : undefined}
                >
                  {amount}
                </span>
                {period && <span className="l-pricing-card__period">{period}</span>}
              </div>
              {hint && (
                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--landing-muted)',
                    marginTop: '-4px',
                    marginBottom: '14px',
                    lineHeight: 1.4,
                  }}
                >
                  {hint}
                </div>
              )}
              <ul className="l-pricing-card__features">
                {bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <button
                onClick={onCta}
                className={`l-btn${ctaStyle === 'primary' ? ' l-btn--primary' : ' l-btn--outline'}`}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {ctaLabel}
              </button>
            </div>
          ))}
        </div>
        <p
          className="reveal"
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--landing-muted)',
            marginTop: '24px',
            maxWidth: '720px',
            marginLeft: 'auto',
            marginRight: 'auto',
            opacity: 0.85,
            lineHeight: 1.55,
          }}
        >
          Цены — ориентир под рынок РФ: соло-SaaS обычно 1 500–3 500 ₽, командные/агентские
          5 000–12 000 ₽. Pro в 1 990 ₽ — психологический якорь под чек одного клиента,
          которого окупает первая же закрытая сделка.
        </p>
      </div>
    </section>
  );
}
