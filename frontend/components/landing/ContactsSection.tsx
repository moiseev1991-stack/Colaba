import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/lib/site';

// Последний блок главной (PR 2.2): вопросы и поддержка. Кнопки «Создать аккаунт» здесь нет —
// форма регистрации стоит прямо над этим блоком.
export function ContactsSection() {
  return (
    <section id="contacts" className="l-contact">
      <div className="l-contact__orb" />
      <div className="container l-contact__inner">
        <h2
          className="section-title reveal"
          style={{ textAlign: 'center', color: '#fff', marginBottom: '16px' }}
        >
          Остались вопросы?
        </h2>
        <p className="l-contact__sub reveal">
          Напишите нам — ответим и поможем настроить первый поиск под вашу нишу.
        </p>
        <div className="l-contact__actions reveal">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="l-btn l-btn--primary l-btn--large">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" />
              <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {SUPPORT_EMAIL}
          </a>
        </div>
        <p
          className="reveal"
          style={{
            marginTop: '32px',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          <Link href="/policy" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>
            Политика конфиденциальности
          </Link>
          {' · '}
          Используем только публичные источники данных
        </p>
      </div>
    </section>
  );
}
