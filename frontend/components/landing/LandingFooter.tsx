import Link from 'next/link';
import { LEGAL_LINKS, SUPPORT_EMAIL } from '@/lib/site';

const SECTION_LINKS = [
  { href: '#diagnosis', label: 'Диагноз' },
  { href: '#features', label: 'Возможности' },
  { href: '#pricing', label: 'Цены' },
  { href: '#examples', label: 'Примеры' },
  { href: '#faq', label: 'FAQ' },
];

export function LandingFooter() {
  return (
    <footer className="l-footer">
      <div
        className="l-footer__inner"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '32px',
          alignItems: 'start',
        }}
      >
        <div>
          <a
            href="#top"
            className="l-footer__logo"
            style={{ display: 'inline-block', marginBottom: '12px' }}
          >
            SpinLid
          </a>
          <div
            style={{ fontSize: '12px', opacity: 0.7, lineHeight: 1.5 }}
            suppressHydrationWarning
          >
            © {new Date().getFullYear()} · Сбор лидов и письма под боль клиента
            <br />
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{ textDecoration: 'underline' }}
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              opacity: 0.55,
              marginBottom: '10px',
              fontWeight: 600,
            }}
          >
            Продукт
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: '6px',
              fontSize: '13px',
            }}
          >
            {SECTION_LINKS.map(({ href, label }) => (
              <li key={label}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              opacity: 0.55,
              marginBottom: '10px',
              fontWeight: 600,
            }}
          >
            Правовые документы
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: '6px',
              fontSize: '13px',
            }}
          >
            {LEGAL_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
