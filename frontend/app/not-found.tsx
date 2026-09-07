import Link from 'next/link';

// Аудит 2026-09-07 (P1.3): у анонима не было 404 — middleware редиректил
// любой неизвестный путь на /auth/login (307), путая юзера и краулеров.
// not-found.tsx рендерится Next.js для несовпавших маршрутов; middleware
// больше не перехватывает «не-страницы» анонима (см. middleware.ts).
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))] px-6 text-center">
      <div className="font-display text-6xl font-bold text-[hsl(var(--accent))]">404</div>
      <h1 className="mt-4 font-display text-xl font-semibold text-[hsl(var(--text))]">
        Страница не найдена
      </h1>
      <p className="mt-2 max-w-md text-sm text-[hsl(var(--muted))]">
        Возможно, ссылка устарела или была опечатка. Проверьте адрес или вернитесь на главную.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-v2-md bg-[hsl(var(--accent))] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          На главную
        </Link>
        <Link
          href="/dashboard"
          className="rounded-v2-md border border-[hsl(var(--border))] px-5 py-2.5 text-sm font-medium text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))]"
        >
          В кабинет
        </Link>
      </div>
    </div>
  );
}
