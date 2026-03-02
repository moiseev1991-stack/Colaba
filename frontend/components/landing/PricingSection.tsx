const PLANS = [
  {
    name: 'Starter',
    amount: 'Бесплатно',
    period: '',
    featured: false,
    badge: null,
    bullets: [
      'До 500 лидов в месяц',
      'До 5 кампаний КП',
      'Экспорт CSV',
      'История 30 дней',
      'Email поддержка',
    ],
    ctaLabel: 'Начать бесплатно',
    ctaStyle: 'outline',
  },
  {
    name: 'Pro',
    amount: 'По запросу',
    period: '',
    featured: true,
    badge: 'Популярный',
    bullets: [
      'До 5 000 лидов в месяц',
      'До 50 кампаний КП',
      'Приоритет очереди',
      'История 90 дней',
      'Все форматы экспорта',
      'Расширенная поддержка',
    ],
    ctaLabel: 'Подключить Pro',
    ctaStyle: 'primary',
  },
  {
    name: 'Team',
    amount: 'Custom',
    period: '',
    featured: false,
    badge: null,
    bullets: [
      'Расширенные лимиты',
      'Неограниченные кампании',
      'История 365 дней',
      'Командный доступ, роли',
      'API доступ',
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
        <div className="l-pricing__grid">
          {PLANS.map(({ name, amount, period, featured, badge, bullets, ctaLabel, ctaStyle }) => (
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
      </div>
    </section>
  );
}
