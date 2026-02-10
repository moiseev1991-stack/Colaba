export function HeroSection({ onCtaRegister, onCtaFeatures }: { onCtaRegister: () => void; onCtaFeatures: () => void }) {
  return (
    <section id="top" className="relative overflow-hidden py-16 md:py-24">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--landing-accent-soft)] via-transparent to-[#e0e7ff]/50 pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
      <div className="container relative z-10 grid gap-12 md:grid-cols-2 md:gap-16 md:items-center">
        <div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-[44px] md:leading-[1.2]" style={{ color: 'var(--landing-text)' }}>
            Поиск лидов, SEO и госзакупки — в одном кабинете
          </h1>
          <p className="mt-5 text-base leading-relaxed md:text-lg" style={{ color: 'var(--landing-muted)' }}>
            Запускайте поиски, собирайте контакты, выгружайте таблицы. Минимум настроек — максимум результата.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              onClick={onCtaRegister}
              className="h-12 px-6 rounded-[var(--landing-radius)] text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2"
              style={{ backgroundColor: 'var(--landing-accent)' }}
            >
              Создать аккаунт
            </button>
            <button
              onClick={onCtaFeatures}
              className="h-12 px-6 rounded-[var(--landing-radius)] text-sm font-medium border transition-colors hover:bg-[var(--landing-accent-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2"
              style={{ borderColor: 'var(--landing-border)', color: 'var(--landing-text)' }}
            >
              Посмотреть возможности
            </button>
          </div>
        </div>
        <div className="rounded-[12px] border shadow-lg p-4" style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--landing-muted)' }}>История запросов</div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--landing-border)' }}>
                <th className="py-2 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Запрос</th>
                <th className="py-2 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Статус</th>
                <th className="py-2 text-right font-medium" style={{ color: 'var(--landing-text)' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--landing-border)' }}>
                <td className="py-2" style={{ color: 'var(--landing-text)' }}>SEO Москва</td>
                <td className="py-2"><span className="rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(22,163,74,0.15)', color: 'var(--landing-success)' }}>OK</span></td>
                <td className="py-2 text-right"><span className="text-xs" style={{ color: 'var(--landing-accent)' }}>CSV</span></td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--landing-border)' }}>
                <td className="py-2" style={{ color: 'var(--landing-text)' }}>Лиды IT</td>
                <td className="py-2"><span className="rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--landing-danger)' }}>ERROR</span></td>
                <td className="py-2 text-right">—</td>
              </tr>
            </tbody>
          </table>
          <button className="mt-3 w-full h-9 rounded-[var(--landing-radius)] text-xs font-medium" style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}>
            Выгрузить CSV
          </button>
        </div>
      </div>
    </section>
  );
}
