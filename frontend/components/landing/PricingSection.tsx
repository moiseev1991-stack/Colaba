import { OFFER } from '@/lib/offer';

// Раньше здесь были тарифы Free / Pro / Agency с разными ценами. Оплата не подключена,
// поэтому с 15.09 блок показывает одно предложение — бесплатную бету (lib/offer.ts).
// id="pricing" сохранён: на него ведут шапка лендинга, подвалы и кнопка в кабинете.
export function PricingSection({ onCta }: { onCta: () => void }) {
  return (
    <section id="pricing" className="landing-section l-pricing">
      <div className="container">
        <div className="section-label reveal">Цены</div>
        <h2 className="section-title text-center reveal">
          Сейчас — <span style={{ color: 'var(--landing-accent)' }}>бесплатно</span>
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
          {OFFER.lead}
        </p>
        <div
          className="l-pricing-card l-pricing-card--featured reveal"
          style={{ maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto' }}
        >
          <div className="l-pricing-card__badge">{OFFER.badge}</div>
          <div className="l-pricing-card__name">{OFFER.title}</div>
          <div className="l-pricing-card__price">
            <span className="l-pricing-card__amount">0</span>
            <span className="l-pricing-card__currency">₽</span>
            <span className="l-pricing-card__period" style={{ marginLeft: '10px' }}>
              во время беты
            </span>
          </div>
          <ul className="l-pricing-card__features">
            {OFFER.included.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button
            onClick={onCta}
            className="l-btn l-btn--primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {OFFER.cta}
          </button>
        </div>
      </div>
    </section>
  );
}
