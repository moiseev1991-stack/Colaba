import Link from 'next/link';

export function ContactsSection() {
  return (
    <section id="contacts" className="landing-section">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>Контакты и доверие</h2>
        <p className="mt-2 text-base max-w-[680px]" style={{ color: 'var(--landing-muted)' }}>
          Используем открытые источники: выдачу поисковиков, публичные реестры. Соблюдаем ограничения провайдеров.
        </p>
        <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--landing-text)' }}>Support</h3>
            <a href="mailto:support@spinlid.io" className="text-sm hover:underline block mt-1" style={{ color: 'var(--landing-accent)' }}>
              support@spinlid.io
            </a>
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--landing-text)' }}>Документы</h3>
            <div className="mt-1 flex flex-col gap-1">
              <Link href="/policy" className="text-sm hover:underline" style={{ color: 'var(--landing-accent)' }}>
                Политика конфиденциальности
              </Link>
              <a href="#" className="text-sm hover:underline opacity-60" style={{ color: 'var(--landing-accent)' }}>Оферта</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
