const ANCHORS = [
  { id: 'features', label: 'Возможности' },
  { id: 'audience', label: 'Для кого' },
  { id: 'how', label: 'Как работает' },
  { id: 'examples', label: 'Примеры' },
  { id: 'pricing', label: 'Тарифы' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contacts', label: 'Контакты' },
];

export function LandingFooter() {
  return (
    <footer className="border-t py-10" style={{ borderColor: 'var(--landing-border)', backgroundColor: 'var(--landing-card)' }}>
      <div className="container flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--landing-radius)]" style={{ backgroundColor: 'var(--landing-accent-soft)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--landing-accent)' }}>S</span>
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--landing-text)' }}>SpinLid</span>
        </div>
        <nav className="flex flex-wrap gap-4">
          {ANCHORS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} className="text-sm hover:underline" style={{ color: 'var(--landing-muted)' }}>
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div className="container mt-6 pt-6 border-t text-xs" style={{ borderColor: 'var(--landing-border)', color: 'var(--landing-muted)' }}>
        © {new Date().getFullYear()} SpinLid. SaaS для поиска лидов, SEO и госзакупок.
      </div>
    </footer>
  );
}
