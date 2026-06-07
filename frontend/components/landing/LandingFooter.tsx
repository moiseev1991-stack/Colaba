import Link from 'next/link';

const SECTION_LINKS = [
  { href: '#diagnosis', label: 'Диагноз' },
  { href: '#features', label: 'Возможности' },
  { href: '#pricing', label: 'Тарифы' },
  { href: '#examples', label: 'Примеры' },
  { href: '#faq', label: 'FAQ' },
];

const LEGAL_LINKS = [
  { href: '/terms', label: 'Соглашение' },
  { href: '/policy', label: 'Политика' },
  { href: '/consent', label: 'Согласие на ПДн' },
  { href: '/offer', label: 'Оферта' },
  { href: '/data-sources', label: 'Источники' },
];

export const SUPPORT_EMAIL = 'support@spinlid.ru';

export function LandingFooter() {
  return (
    <footer className="l-footer">
      <div className="l-footer__inner">
        <a href="#top" className="l-footer__logo">
          SpinLid
        </a>

        <ul className="l-footer__links">
          {SECTION_LINKS.map(({ href, label }) => (
            <li key={label}>
              <a href={href}>{label}</a>
            </li>
          ))}
          {LEGAL_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href}>{label}</Link>
            </li>
          ))}
          <li>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </li>
        </ul>

        <span className="l-footer__note" suppressHydrationWarning>
          © {new Date().getFullYear()} SpinLid · Сбор лидов и рассылка КП
        </span>
      </div>
    </footer>
  );
}
