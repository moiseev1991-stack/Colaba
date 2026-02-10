const STEPS = [
  'Выберите модуль (SEO / Лиды / Госзакупки)',
  'Настройте параметры (запрос, город, фильтры)',
  'Запустите и следите за статусом',
  'Получите результат: таблица, экспорт CSV, копирование контактов',
];

export function HowItWorksSection() {
  return (
    <section id="how" className="py-16 md:py-20">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>Как это работает</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>Четыре простых шага</p>
        <div className="mt-12 grid gap-8 md:grid-cols-2 md:grid-rows-2">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}>
                {i + 1}
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--landing-text)' }}>{step}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
