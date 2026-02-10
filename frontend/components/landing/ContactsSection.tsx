import Link from 'next/link';

export function ContactsSection() {
  return (
    <section id="contacts" className="py-16 md:py-20">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>Контакты и доверие</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>
          Используем открытые источники / выдачу поисковиков / публичные данные. Соблюдаем ограничения провайдеров.
        </p>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--landing-text)' }}>Поддержка</h3>
            <a href="mailto:support@spinlid.io" className="text-sm hover:underline" style={{ color: 'var(--landing-accent)' }}>support@spinlid.io</a>
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--landing-text)' }}>Документы</h3>
            <Link href="/policy" className="text-sm hover:underline" style={{ color: 'var(--landing-accent)' }}>Политика конфиденциальности</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
