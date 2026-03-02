import { QuickSignup } from './QuickSignup';
import { LeadDemoPanel } from './LeadDemoPanel';

export function RegisterSection() {
  return (
    <section id="register" className="landing-section l-register">
      <div className="register-section-container relative z-10">
        <div className="section-label reveal">Регистрация</div>
        <h2
          className="reveal"
          style={{
            fontSize: 'clamp(26px, 3.5vw, 36px)',
            fontWeight: 800,
            color: 'var(--landing-text)',
            marginBottom: '8px',
            letterSpacing: '-0.5px',
          }}
        >
          Начните за 1 минуту
        </h2>
        <p
          className="reveal"
          style={{
            fontSize: '15px',
            color: 'var(--landing-muted)',
            marginBottom: '40px',
            maxWidth: '520px',
          }}
        >
          Без кредитной карты · 30 секунд · можно удалить аккаунт
        </p>

        <div
          className="reveal l-register__grid"
        >
          {/* Left: form */}
          <div className="l-register__form-wrap">
            <p
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--landing-muted)',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Создайте аккаунт
            </p>
            <QuickSignup />
          </div>

          {/* Right: demo panel */}
          <div style={{ minWidth: 0 }}>
            <LeadDemoPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
