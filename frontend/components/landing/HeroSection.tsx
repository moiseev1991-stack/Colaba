'use client';

export function HeroSection({
  onCtaRegister,
  onCtaExamples,
}: {
  onCtaRegister: () => void;
  onCtaExamples: () => void;
}) {
  return (
    <section className="l-hero" id="top">
      {/* Фоновые слои */}
      <div className="l-hero__bg">
        <div className="l-hero__overlay" />
        <div className="l-hero__grid" />
        <div className="l-hero__orb l-hero__orb--1" />
        <div className="l-hero__orb l-hero__orb--2" />
      </div>

      {/* Контент */}
      <div className="l-hero__inner">
        <div>
          {/* Badge */}
          <div className="l-hero__badge reveal">
            <span className="l-hero__badge-dot" />
            Лиды · КП · SEO · Госзакупки — всё в одном кабинете
          </div>

          {/* Заголовок */}
          <h1 className="l-hero__title reveal">
            Собирайте базы клиентов<br />
            <span className="grad-text">и отправляйте КП</span><br />
            за считанные минуты
          </h1>

          <p className="l-hero__sub reveal">
            Ниша + регион → список компаний и контактов из открытых источников<br />
            Отбирайте нужных, отправляйте КП, получайте статусы доставки
          </p>

          {/* CTA */}
          <div className="l-hero__actions reveal">
            <button className="l-btn l-btn--primary" onClick={onCtaRegister}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Создать аккаунт
            </button>
            <button className="l-btn l-btn--ghost" onClick={onCtaExamples}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
              </svg>
              Посмотреть демо
            </button>
          </div>

          {/* Статистика */}
          <div className="l-hero__stats reveal">
            <div>
              <div className="l-hero__stat-val">50K<span>+</span></div>
              <div className="l-hero__stat-label">Лидов собрано</div>
            </div>
            <div>
              <div className="l-hero__stat-val">98<span>%</span></div>
              <div className="l-hero__stat-label">Успешных доставок</div>
            </div>
            <div>
              <div className="l-hero__stat-val">4<span>+</span></div>
              <div className="l-hero__stat-label">Модуля в кабинете</div>
            </div>
          </div>
        </div>

        {/* Floating cards */}
        <div className="l-hero__float-cards">
          <div className="l-hero__float-card l-hero__float-card--1 reveal">
            <div className="l-hfc__icon l-hfc__icon--green">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2.5" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="l-hfc__val">+142</div>
              <div className="l-hfc__label">Новых лидов сегодня</div>
            </div>
          </div>

          <div className="l-hero__float-card l-hero__float-card--2 reveal">
            <div className="l-hfc__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2.5" />
                <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="l-hfc__val">34%</div>
              <div className="l-hfc__label">Open rate кампаний</div>
            </div>
          </div>

          <div className="l-hero__float-card l-hero__float-card--3 reveal">
            <div className="l-hfc__icon l-hfc__icon--purple">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="l-hfc__val">30s</div>
              <div className="l-hfc__label">До первого результата</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <a href="#stats" className="l-hero__scroll-hint">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </section>
  );
}
