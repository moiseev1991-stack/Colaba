const AUDIENCE_CHIPS = [
  { dot: 'green',  label: 'Отделы продаж B2B' },
  { dot: 'blue',   label: 'Агентства лидогенерации' },
  { dot: 'purple', label: 'Производители и оптовики' },
  { dot: 'orange', label: 'Сервисные компании' },
  { dot: 'cyan',   label: 'Франшизы и сети' },
  { dot: 'green',  label: 'HR и рекрутинг' },
  { dot: 'yellow', label: 'Бизнес-девелопмент' },
  { dot: 'blue',   label: 'Маркетинг и аналитика' },
];

const INTEGRATIONS = [
  { dot: 'green',  label: 'Яндекс / Google' },
  { dot: 'blue',   label: '2GIS' },
  { dot: 'orange', label: 'Публичные реестры' },
  { dot: 'purple', label: 'CSV / Excel экспорт' },
  { dot: 'cyan',   label: 'Email-рассылки' },
  { dot: 'red',    label: 'Blacklist доменов' },
  { dot: 'green',  label: 'История запусков' },
  { dot: 'yellow', label: 'Webhook / API (скоро)' },
];

export function AudienceSection() {
  return (
    <section id="audience" className="landing-section l-tools">
      <div className="container">
        <div className="section-label reveal">Для кого и источники</div>
        <h2 className="section-title reveal">
          Кому подходит <span style={{ color: 'var(--landing-accent)' }}>SpinLid</span>
        </h2>

        <div style={{ marginBottom: '48px' }}>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: 'var(--landing-muted)',
              marginBottom: '14px',
            }}
          >
            Наши пользователи
          </p>
          <div className="l-tools__grid reveal">
            {AUDIENCE_CHIPS.map(({ dot, label }) => (
              <div className="l-tool-chip" key={label}>
                <span className={`l-tool-chip__dot l-tool-chip__dot--${dot}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: 'var(--landing-muted)',
              marginBottom: '14px',
            }}
          >
            Источники и интеграции
          </p>
          <div className="l-tools__grid reveal">
            {INTEGRATIONS.map(({ dot, label }) => (
              <div className="l-tool-chip" key={label}>
                <span className={`l-tool-chip__dot l-tool-chip__dot--${dot}`} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
