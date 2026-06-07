import Link from 'next/link';
import { LegalFooter } from './LegalFooter';

interface LegalPageShellProps {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}

export function LegalPageShell({ title, updatedAt, children }: LegalPageShellProps) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'hsl(var(--bg))', color: 'hsl(var(--text))' }}
    >
      <header
        className="border-b"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-display font-bold text-lg tracking-tight"
            style={{ color: 'hsl(var(--text))' }}
          >
            SpinLid
          </Link>
          <Link
            href="/"
            className="text-sm hover:underline"
            style={{ color: 'hsl(var(--muted))' }}
          >
            ← На главную
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <article className="max-w-3xl mx-auto px-6 py-12">
          <h1
            className="font-display font-semibold tracking-tight text-3xl md:text-4xl mb-3"
            style={{ color: 'hsl(var(--text))' }}
          >
            {title}
          </h1>
          <p
            className="text-sm mb-10"
            style={{ color: 'hsl(var(--muted))' }}
          >
            Редакция от {updatedAt}
          </p>
          <div className="legal-content space-y-6 leading-relaxed">
            {children}
          </div>
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}
