'use client';

// ТЗ лендинг-рефакта 2026-06-03 §2+§6: переориентация с «парсер контактов» на
// «компании с диагнозом». Бейдж описывает фишку (диагноз из отзывов), заголовок
// формулирует отстройку от Snov/Apollo. Floating cards и три статистики справа —
// теперь продуктовые факты, а не выдуманные числа клиентов.

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
          {/* Badge — фишка, а не перечисление модулей */}
          <div className="l-hero__badge reveal">
            <span className="l-hero__badge-dot" />
            Компании с диагнозом из отзывов на картах
          </div>

          {/* Заголовок */}
          <h1 className="l-hero__title reveal">
            Не база контактов.<br />
            <span className="grad-text">Компании с диагнозом.</span>
          </h1>

          <p className="l-hero__sub reveal">
            Укажите нишу и город — SpinLid найдёт компании на картах,
            вытащит боли клиентов из отзывов и подготовит письмо под каждую боль.
            Не «вот 1000 компаний», а «вот 23 компании, где клиенты жалуются на X —
            вот цитаты — вот контакт — вот черновик письма».
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

          {/* Продуктовые факты вместо выдуманных клиентских цифр */}
          <div className="l-hero__stats reveal">
            <div>
              <div className="l-hero__stat-val">2<span>мин</span></div>
              <div className="l-hero__stat-label">Первые 50 компаний</div>
            </div>
            <div>
              <div className="l-hero__stat-val">500</div>
              <div className="l-hero__stat-label">Лидов в месяц бесплатно</div>
            </div>
            <div>
              <div className="l-hero__stat-val">AI</div>
              <div className="l-hero__stat-label">Анализ отзывов и черновик письма</div>
            </div>
          </div>
        </div>

        {/* Floating cards — продуктовые «фишки», не клиентские цифры */}
        <div className="l-hero__float-cards">
          <div className="l-hero__float-card l-hero__float-card--1 reveal">
            <div className="l-hfc__icon l-hfc__icon--green">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v6m0 0l-3-3m3 3l3-3M3 12h6m0 0l-3-3m3 3l-3 3M21 12h-6m0 0l3 3m-3-3l3-3M12 22v-6m0 0l3 3m-3-3l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="l-hfc__val">Боли</div>
              <div className="l-hfc__label">из отзывов клиентов</div>
            </div>
          </div>

          <div className="l-hero__float-card l-hero__float-card--2 reveal">
            <div className="l-hfc__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="l-hfc__val">Цитаты</div>
              <div className="l-hfc__label">доказательства боли</div>
            </div>
          </div>

          <div className="l-hero__float-card l-hero__float-card--3 reveal">
            <div className="l-hfc__icon l-hfc__icon--purple">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" />
                <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="l-hfc__val">Письмо</div>
              <div className="l-hfc__label">черновик под боль</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <a href="#diagnosis" className="l-hero__scroll-hint">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </section>
  );
}
