const AUDIENCE = [
  { title: 'Агентства', desc: 'Быстро собирать лиды под клиента' },
  { title: 'Отделы продаж', desc: 'Наполнять воронку целевыми контактами' },
  { title: 'Маркетинг и аналитика', desc: 'Контроль запусков и результатов' },
];

export function AudienceSection() {
  return (
    <section id="audience" className="py-16 md:py-20">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>Для кого</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>
          Сервис сделан для работы с таблицами и большими объёмами данных.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {AUDIENCE.map(({ title, desc }) => (
            <div
              key={title}
              className="rounded-[12px] border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
            >
              <h3 className="text-lg font-semibold" style={{ color: 'var(--landing-text)' }}>{title}</h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--landing-muted)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
