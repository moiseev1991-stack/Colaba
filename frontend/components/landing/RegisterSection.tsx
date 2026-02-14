import { QuickSignup } from './QuickSignup';
import { LeadDemoPanel } from './LeadDemoPanel';

export function RegisterSection() {
  return (
    <section
      id="register"
      className="relative overflow-hidden landing-section"
      style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.03) 0%, transparent 50%, rgba(224, 231, 255, 0.2) 100%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.008]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />
      <div className="register-section-container relative z-10">
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-medium mb-3"
          style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
        >
          Регистрация
        </span>
        <h2 className="text-2xl font-extrabold md:text-[28px] lg:text-[30px]" style={{ color: 'var(--landing-text)' }}>
          Начните за 1 минуту
        </h2>
        <p className="mt-2 text-sm md:text-base max-w-[680px] opacity-75" style={{ color: 'var(--landing-text)' }}>
          Соберите лиды, отправьте КП и получите статусы. SEO и госзакупки — в том же кабинете.
        </p>
        <div className="mt-8 lg:mt-10 register-section-grid">
          {/* Left: form */}
          <div className="min-w-0">
            <p className="mb-4 text-xs md:text-sm" style={{ color: 'var(--landing-muted)' }}>
              Без карты • 30 секунд • можно удалить аккаунт
            </p>
            <div
              className="w-full max-w-[480px] rounded-[18px] border p-6 lg:p-7"
              style={{
                backgroundColor: 'var(--landing-card)',
                borderColor: 'rgba(15, 23, 42, 0.08)',
                boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
              }}
            >
              <h3 className="text-base font-semibold" style={{ color: 'var(--landing-text)' }}>Создайте аккаунт</h3>
              <div className="mt-4">
                <QuickSignup />
              </div>
            </div>
          </div>
          {/* Right: LeadDemoPanel */}
          <div className="min-w-0">
            <LeadDemoPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
