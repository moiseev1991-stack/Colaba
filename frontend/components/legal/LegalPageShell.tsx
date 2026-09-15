import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';

interface LegalPageShellProps {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}

// Юрстраницы всегда светлые, как остальные публичные страницы: цвета заданы явно,
// а не через hsl(var(--bg)) — иначе при тёмной теме кабинета страница темнела.
// Шапка фиксированная (66px), поэтому у main отступ сверху.
export function LegalPageShell({ title, updatedAt, children }: LegalPageShellProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f8fafc', color: '#0f172a' }}>
      <PublicHeader variant="subpage" forceSolid />

      <main className="flex-1" style={{ paddingTop: '66px' }}>
        <article className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="font-semibold tracking-tight text-3xl md:text-4xl mb-3" style={{ color: '#0f172a' }}>
            {title}
          </h1>
          <p className="text-sm mb-10" style={{ color: '#64748b' }}>
            Редакция от {updatedAt}
          </p>
          <div className="legal-content space-y-6 leading-relaxed">{children}</div>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
