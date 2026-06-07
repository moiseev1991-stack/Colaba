'use client';

import { usePathname } from 'next/navigation';
import { ThemeInit } from './ThemeInit';
import { AppLayout } from './AppLayout';

// Публичные роуты, которые НЕ должны быть обёрнуты в AppLayout (sidebar +
// верхняя панель кабинета). На них собственный заголовок/подвал, а sidebar
// кабинета для случайно залогиненного юзера выглядит чужеродно.
const PUBLIC_NON_APP_PATHS = new Set<string>([
  // Правовые
  '/terms',
  '/policy',
  '/consent',
  '/offer',
  '/data-sources',
  // SEO-лендинги
  '/parsing-otzyvov',
  '/parser-2gis',
  '/parser-yandex-maps',
  '/baza-klientov',
  '/sbor-kontaktov',
  '/holodnaya-rassylka',
]);

function isPublicNonAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_NON_APP_PATHS.has(pathname);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  const isAuthPage = pathname?.startsWith('/auth/');
  const isPublicNonApp = isPublicNonAppPath(pathname);
  const useAppLayout = !isLanding && !isAuthPage && !isPublicNonApp;

  return (
    <>
      <ThemeInit />
      {useAppLayout ? <AppLayout>{children}</AppLayout> : children}
    </>
  );
}
