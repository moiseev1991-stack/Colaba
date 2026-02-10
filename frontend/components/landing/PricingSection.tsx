const PLANS = [
  { name: 'Starter', desc: 'Для одного пользователя / базовые лимиты', badge: 'по запросу' },
  { name: 'Pro', desc: 'Для команды / расширенные лимиты', badge: 'по запросу' },
  { name: 'Team', desc: 'Для агентств / приоритет / роли', badge: 'по запросу' },
];

export function PricingSection({ onCta }: { onCta: () => void }) {
  return (
    <section id="pricing" className="py-16 md:py-20">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>Тарифы</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>Подберём план под ваши задачи</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map(({ name, desc, badge }) => (
            <div
              key={name}
              className="rounded-[12px] border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
            >
              <h3 className="text-lg font-semibold" style={{ color: 'var(--landing-text)' }}>{name}</h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--landing-muted)' }}>{desc}</p>
              <span className="mt-3 inline-block rounded px-2 py-1 text-xs font-medium" style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}>{badge}</span>
              <button
                onClick={onCta}
                className="mt-6 w-full h-10 rounded-[var(--landing-radius)] text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2"
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
