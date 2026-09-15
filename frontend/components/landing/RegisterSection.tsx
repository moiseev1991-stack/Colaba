import { QuickSignup } from './QuickSignup';
import { OFFER } from '@/lib/offer';

// Секция 8 главной (PR 2.2): единственная форма на странице — регистрация (решение Р2).
// Правая демо-панель убрана: пример выдачи и возможности уже показаны выше.
export function RegisterSection() {
  return (
    <section id="register" className="landing-section l-register">
      <div className="register-section-container relative z-10" style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="section-label reveal" style={{ display: 'flex', justifyContent: 'center' }}>
          Регистрация
        </div>
        <h2
          className="reveal"
          style={{
            fontSize: 'clamp(26px, 3.5vw, 36px)',
            fontWeight: 800,
            color: 'var(--landing-text)',
            marginBottom: '8px',
            letterSpacing: '-0.5px',
            textAlign: 'center',
          }}
        >
          Попробуйте бесплатно
        </h2>
        <p
          className="reveal"
          style={{
            fontSize: '15px',
            color: 'var(--landing-muted)',
            marginBottom: '32px',
            textAlign: 'center',
          }}
        >
          {OFFER.short} · без кредитной карты · аккаунт можно удалить
        </p>

        <div className="reveal l-register__form-wrap">
          <QuickSignup />
        </div>
      </div>
    </section>
  );
}
