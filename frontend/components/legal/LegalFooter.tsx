import Link from 'next/link';
import { LEGAL_LINKS, SUPPORT_EMAIL } from '@/lib/site';

export function LegalFooter() {
  return (
    <footer
      className="border-t"
      style={{
        background: 'hsl(var(--surface))',
        borderColor: 'hsl(var(--border))',
        color: 'hsl(var(--muted))',
      }}
    >
      <div className="max-w-4xl mx-auto px-6 py-8 text-sm">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 mb-4">
          {LEGAL_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className="hover:underline">
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span suppressHydrationWarning>
            © {new Date().getFullYear()} SpinLid · Сбор лидов и рассылка КП
          </span>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
