// ТЗ лендинг-рефакта 2026-06-03 §8: в каждом тарифе явно упомянут диагноз
// (анализ отзывов) — раньше тарифы описывали только «лиды / КП / экспорт»,
// без главной фишки. CTA-кнопки приведены к 2 формулировкам: «Создать аккаунт»
// (первичная) + «Обсудить условия» (для Team).

const PLANS = [
  {
    name: 'Starter',
    amount: 'Бесплатно',
    period: '',
    featured: false,
    badge: null,
    bullets: [
      'До 500 компаний с диагнозом в месяц',
      'AI-анализ отзывов: топ-3 болей на карточку',
      'Черновики писем под боль',
      'До 5 email-кампаний',
      'Экспорт CSV · история 30 дней',
    ],
    ctaLabel: 'Создать аккаунт',
    ctaStyle: 'outline',
  },
  {
    name: 'Pro',
    amount: 'По запросу',
    period: '',
    featured: true,
    badge: 'Популярный',
    bullets: [
      'До 5 000 компаний с диагнозом в месяц',
      'AI-анализ + цитаты-доказательства',
      'AI-пресеты с собственным промптом',
      'До 50 email-кампаний',
      'Юр.данные (DaData) · Excel «лиды на сайт»',
      'История 90 дней · приоритет очереди',
    ],
    ctaLabel: 'Создать аккаунт',
    ctaStyle: 'primary',
  },
  {
    name: 'Team',
    amount: 'Custom',
    period: '',
    featured: false,
    badge: null,
    bullets: [
      'Расширенные лимиты на диагноз и письма',
      'Неограниченные кампании КП',
      'Командный доступ, роли',
      'API доступ · Webhook',
      'История 365 дней',
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
          Анализ отзывов и черновики писем под боль входят во все тарифы —
          это главная фишка SpinLid, а не платный апгрейд.
        </p>
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
