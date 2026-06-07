import Link from 'next/link';
import { SEO_NAV_LINKS } from './seoNavLinks';

/**
 * Секция-навигатор «Возможности» на главной — карточки с ссылками на
 * все 6 SEO-страниц. Позволяет посетителю лендинга углубиться в
 * конкретный сценарий (парсер 2GIS, сбор контактов и т.п.) без
 * регистрации. Заодно — внутренняя перелинковка для SEO.
 */
export function SolutionsSection() {
  return (
    <section
      id="solutions"
      className="reveal"
      style={{
        padding: '80px 24px',
        background: 'var(--landing-bg, #f8fafc)',
      }}
    >
      <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
        <div className="section-label" style={{ textAlign: 'center' }}>
          Решения
        </div>
        <h2
          className="section-title"
          style={{ textAlign: 'center', marginTop: '8px', marginBottom: '12px' }}
        >
          Подробнее по каждой задаче
        </h2>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--landing-muted, #64748b)',
            fontSize: '16px',
            maxWidth: '640px',
            margin: '0 auto 40px',
            lineHeight: 1.55,
          }}
        >
          Открой нужную тему — отдельная страница с описанием, шагами,
          FAQ и примерами. Без регистрации.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {SEO_NAV_LINKS.map((s, i) => (
            <Link
              key={s.href}
              href={s.href}
              style={{
                display: 'block',
                padding: '24px 22px',
                borderRadius: '16px',
                background: '#fff',
                border: '1px solid rgba(15, 23, 42, 0.08)',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                color: 'inherit',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              className="solutions-card"
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background:
                    'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
                  color: '#0b1220',
                  fontWeight: 700,
                  fontSize: '14px',
                  marginBottom: '14px',
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display), Unbounded, sans-serif',
                  fontSize: '17px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--landing-text, #0f172a)',
                  lineHeight: 1.25,
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--landing-muted, #64748b)',
                  lineHeight: 1.5,
                }}
              >
                {s.hint}
              </div>
              <div
                style={{
                  marginTop: '14px',
                  color: '#06b6d4',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Подробнее →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
