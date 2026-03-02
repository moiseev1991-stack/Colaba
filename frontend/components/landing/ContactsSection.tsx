import Link from 'next/link';

export function ContactsSection() {
  return (
    <section id="contacts" className="l-contact">
      <div className="l-contact__orb" />
      <div className="container l-contact__inner">
        <div className="section-label reveal">Начать</div>
        <h2
          className="section-title reveal"
          style={{ textAlign: 'center', color: '#fff', marginBottom: '16px' }}
        >
          Готовы попробовать?
        </h2>
        <p className="l-contact__sub reveal">
          Регистрация за 30 секунд. Без кредитной карты.<br />
          Первые 500 лидов и 5 кампаний КП — бесплатно.
        </p>
        <div className="l-contact__actions reveal">
          <a href="#register" className="l-btn l-btn--primary l-btn--large">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Создать аккаунт
          </a>
          <a
            href="mailto:support@spinlid.io"
            className="l-btn l-btn--ghost"
            style={{ color: 'rgba(255,255,255,0.7)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" />
              <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            support@spinlid.io
          </a>
        </div>
        <p
          className="reveal"
          style={{
            marginTop: '32px',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          <Link href="/policy" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>
            Политика конфиденциальности
          </Link>
          {' · '}
          Используем только публичные источники данных
        </p>
      </div>
    </section>
  );
}
