import Link from 'next/link';

const LINKS = [
  { href: '#diagnosis', label: 'Диагноз' },
  { href: '#features', label: 'Возможности' },
  { href: '#pricing', label: 'Тарифы' },
  { href: '#examples', label: 'Примеры' },
  { href: '#faq', label: 'FAQ' },
  { href: '/policy', label: 'Политика' },
];

export function LandingFooter() {
  return (
    <footer className="l-footer">
      <div className="l-footer__inner">
        <a href="#top" className="l-footer__logo">
          SpinLid
        </a>

        <ul className="l-footer__links">
          {LINKS.map(({ href, label }) => (
            <li key={label}>
              {href.startsWith('/') ? (
                <Link href={href}>{label}</Link>
              ) : (
                <a href={href}>{label}</a>
              )}
            </li>
          ))}
        </ul>

        <span className="l-footer__note" suppressHydrationWarning>
          © {new Date().getFullYear()} SpinLid · Сбор лидов и рассылка КП
        </span>
      </div>
    </footer>
  );
}
