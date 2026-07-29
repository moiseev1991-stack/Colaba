'use client';

import { usePathname } from 'next/navigation';
import { ThemeInit } from './ThemeInit';
import { AppLayout } from './AppLayout';
import { isPublicPath } from '@/lib/public-paths';

// Единый источник правды о «публичной части» — lib/public-paths.
// Эти роуты (главная, правовые, все SEO-лендинги) НЕ оборачиваем в
// AppLayout кабинета: у них собственный заголовок/подвал, а sidebar
// кабинета для случайно залогиненного юзера выглядит чужеродно.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith('/auth/');
  // isPublicPath уже включает '/' (главная) и все лендинги.
  const useAppLayout = !isAuthPage && !isPublicPath(pathname);

  return (
    <>
      <ThemeInit />
      {useAppLayout ? <AppLayout>{children}</AppLayout> : children}
    </>
  );
}
