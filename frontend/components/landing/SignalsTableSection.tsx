'use client';

import { SignalsTableDemo } from './SignalsTableDemo';

/**
 * Обёртка SignalsTableDemo под главную landing-страницу. Подхватывает
 * CSS-переменные landing.css (--landing-*), идёт сразу после Hero —
 * сначала показываем «как выглядит вся выдача с диагнозом» (breadth),
 * потом DiagnosisSection раскрывает одну компанию в глубину (depth).
 */
export function SignalsTableSection() {
  return (
    <section id="signals" className="landing-section" style={{ paddingBottom: '24px' }}>
      <div className="container" style={{ maxWidth: '1160px' }}>
        <div className="section-label reveal">Так выглядит выдача</div>
        <h2 className="section-title reveal" style={{ marginBottom: '12px' }}>
          Не «вот 1000 контактов», а{' '}
          <span style={{ color: 'var(--landing-accent)' }}>
            вот кому, с чем и как написать
          </span>
        </h2>
        <p
          className="reveal"
          style={{
            fontSize: '16px',
            color: 'var(--landing-muted)',
            maxWidth: '720px',
            marginBottom: '32px',
            lineHeight: 1.6,
          }}
        >
          AI читает отзывы на 2GIS и Я.Картах, выделяет повторяющиеся боли клиентов
          и подкладывает цитату-доказательство под каждую. Вы открываете выдачу — и сразу
          видите, кто болит и чем именно.
        </p>
        <div className="reveal">
          <SignalsTableDemo />
        </div>
        <div
          className="reveal"
          style={{
            marginTop: '14px',
            fontSize: '12px',
            color: 'var(--landing-muted)',
            textAlign: 'center',
          }}
        >
          ПРИМЕР · так выглядит таблица «По картам» в кабинете
        </div>
      </div>
    </section>
  );
}
