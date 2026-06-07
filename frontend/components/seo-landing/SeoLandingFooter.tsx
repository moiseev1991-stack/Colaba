import Link from 'next/link';
import { SEO_NAV_LINKS } from '@/components/landing/seoNavLinks';

/**
 * Footer SEO-лендинга — полноценный, в стиле LandingFooter, но с
 * абсолютными якорями ('/#diagnosis') чтобы клик с SEO-страницы вёл
 * на главную с правильной прокруткой.
 *
 * Состав: лого + © + email | продукт (на главной) | правовые |
 * перелинковка на другие SEO-страницы.
 */

const PRODUCT_LINKS = [
  { href: '/#diagnosis', label: 'Диагноз' },
  { href: '/#pricing', label: 'Тарифы' },
  { href: '/#examples', label: 'Примеры' },
  { href: '/#faq', label: 'FAQ' },
];

const LEGAL_LINKS = [
  { href: '/terms', label: 'Пользовательское соглашение' },
  { href: '/policy', label: 'Политика конфиденциальности' },
  { href: '/consent', label: 'Согласие на обработку ПДн' },
  { href: '/offer', label: 'Публичная оферта' },
  { href: '/data-sources', label: 'Открытые источники' },
];

export const SUPPORT_EMAIL = 'support@spinlid.ru';

export function SeoLandingFooter({ currentHref }: { currentHref?: string }) {
  // Скрываем текущую страницу из «Решений» — нет смысла линковать на саму
  // себя. Берём только ?? 5 ссылок (всё кроме currentHref).
  const otherSeo = currentHref
    ? SEO_NAV_LINKS.filter((l) => l.href !== currentHref)
    : SEO_NAV_LINKS;

  return (
    <footer
      style={{
        background: '#0b1220',
        color: 'rgba(255,255,255,0.78)',
        padding: '40px 24px 32px',
        fontFamily: 'var(--font-body), system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '1120px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '32px',
          alignItems: 'start',
        }}
      >
        <div>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-display), Unbounded, sans-serif',
              fontWeight: 700,
              fontSize: '20px',
              color: '#fff',
              marginBottom: '12px',
              textDecoration: 'none',
            }}
          >
            SpinLid
          </Link>
          <div
            style={{ fontSize: '12px', opacity: 0.7, lineHeight: 1.5 }}
            suppressHydrationWarning
          >
            © {new Date().getFullYear()} · Сбор лидов и рассылка КП
            <br />
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{ color: 'rgba(255,255,255,0.85)', textDecoration: 'underline' }}
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

        <FooterColumn title="Продукт" links={PRODUCT_LINKS} />
        <FooterColumn
          title="Решения"
          links={otherSeo.map((s) => ({ href: s.href, label: s.label }))}
        />
        <FooterColumn title="Правовые документы" links={LEGAL_LINKS} />
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          opacity: 0.55,
          marginBottom: '10px',
          fontWeight: 600,
          color: '#fff',
        }}
      >
        {title}
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gap: '8px',
          fontSize: '13px',
        }}
      >
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              style={{
                color: 'rgba(255,255,255,0.78)',
                textDecoration: 'none',
              }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
