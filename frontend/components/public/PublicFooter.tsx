import Link from 'next/link';
import { BrandWordmark } from '@/components/BrandLogo';
import { SEO_NAV_LINKS } from '@/components/landing/seoNavLinks';
import { LEGAL_LINKS, SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

/**
 * Единый подвал публичных страниц: главная, SEO-страницы, /demo, юрстраницы.
 * Заменил три разных подвала (LandingFooter, SeoLandingFooter, LegalFooter).
 *
 * Колонки: бренд и контакты | продукт (якоря главной) | решения (SEO-страницы) |
 * правовые документы. Якоря всегда абсолютные ('/#faq') — работают и с главной,
 * и с любой другой страницы.
 */

const PRODUCT_LINKS = [
  { href: '/demo', label: 'Пример выдачи' },
  { href: '/#how', label: 'Как это работает' },
  { href: '/#audience', label: 'Для кого' },
  { href: '/#features', label: 'Возможности' },
  { href: '/#pricing', label: 'Цены' },
  { href: '/#faq', label: 'FAQ' },
];

type FooterLink = { href: string; label: string };

export function PublicFooter({ currentHref }: { currentHref?: string } = {}) {
  // Текущую SEO-страницу в «Решениях» не показываем — нет смысла ссылаться на саму себя.
  const solutions: FooterLink[] = SEO_NAV_LINKS.filter((l) => l.href !== currentHref).map(
    ({ href, label }) => ({ href, label }),
  );

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
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              fontSize: '18px',
              color: '#fff',
              marginBottom: '12px',
              textDecoration: 'none',
            }}
          >
            <BrandWordmark height={22} title={SITE_NAME} />
          </Link>
          <div style={{ fontSize: '12px', opacity: 0.7, lineHeight: 1.5 }} suppressHydrationWarning>
            © {new Date().getFullYear()} · Сбор лидов и письма под боль клиента
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
        <FooterColumn title="Решения" links={solutions} />
        <FooterColumn title="Правовые документы" links={LEGAL_LINKS} />
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
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
              className="transition-colors hover:text-white"
              style={{ color: 'rgba(255,255,255,0.78)', textDecoration: 'none' }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
