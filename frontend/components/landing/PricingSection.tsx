const PLANS = [
  {
    name: 'Starter',
    badge: 'по запросу',
    recommended: false,
    bullets: [
      'Лимит сбора лидов: до 500/мес',
      'Кампании КП: до 5/мес',
      'Экспорт CSV, копирование',
      'История 30 дней',
      'Поддержка по email',
    ],
  },
  {
    name: 'Pro',
    badge: 'по запросу',
    recommended: true,
    bullets: [
      'Лимит сбора лидов: до 5000/мес',
      'Кампании КП: до 50/мес',
      'Приоритет очереди',
      'История 90 дней',
      'Все форматы экспорта',
      'Расширенная поддержка',
    ],
  },
  {
    name: 'Team',
    badge: 'по запросу',
    recommended: false,
    bullets: [
      'Расширенные лимиты',
      'Неограниченные кампании КП',
      'История 365 дней',
      'Командный доступ, роли',
      'API доступ',
      'Персональный менеджер',
    ],
  },
];

export function PricingSection({ onCta }: { onCta: () => void }) {
  return (
    <section id="pricing" className="landing-section">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-[30px]" style={{ color: 'var(--landing-text)' }}>
          Тарифы
        </h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>
          Лимиты по сбору лидов и отправке КП — подберём план под задачи
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map(({ name, badge, recommended, bullets }) => (
            <div
              key={name}
              className={`rounded-[12px] border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md relative ${
                recommended ? 'ring-2 ring-[var(--landing-accent)]' : ''
              }`}
              style={{
                backgroundColor: 'var(--landing-card)',
                borderColor: recommended ? 'var(--landing-accent)' : 'var(--landing-border)',
              }}
            >
              {recommended && (
                <span
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: 'var(--landing-accent)' }}
                >
                  Рекомендуем
                </span>
              )}
              <h3 className="text-lg font-semibold" style={{ color: 'var(--landing-text)' }}>
                {name}
              </h3>
              <span
                className="mt-2 inline-block rounded px-2 py-1 text-xs font-medium"
                style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
              >
                {badge}
              </span>
              <ul className="mt-5 space-y-2 text-sm" style={{ color: 'var(--landing-muted)' }}>
                {bullets.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
              <button
                onClick={onCta}
                className={`mt-6 w-full h-10 rounded-[var(--landing-radius)] text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2 ${
                  recommended ? 'ring-2 ring-white ring-offset-2' : ''
                }`}
                style={{ backgroundColor: 'var(--landing-accent)' }}
              >
                Выбрать тариф
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
