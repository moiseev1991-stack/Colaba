'use client';

import { usePathname } from 'next/navigation';
import { ThemeInit } from './ThemeInit';
import { AppLayout } from './AppLayout';
import { ConfirmHost } from './ui/confirm';
import { Toaster } from './ui/toast';

// Каркас кабинета (сайдбар, шапка) — только для страниц кабинета. Раньше он
// включался для всего, что не публичное, и 404 анонима рисовалась внутри
// кабинета со всем меню. Публичные страницы, /auth/* и 404 — без каркаса.
const APP_PREFIXES = [
  '/app',
  '/dashboard',
  '/insights',
  '/leads',
  '/monitor',
  '/organizations',
  '/payment',
  '/profile',
  '/runs',
  '/seo',
  '/settings',
  '/tenders',
];

export function isAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const useAppLayout = isAppPath(pathname);

  return (
    <>
      <ThemeInit />
      {useAppLayout ? <AppLayout>{children}</AppLayout> : children}
      {/* Общие уведомления и подтверждения (PR 3.3b): toast.* и confirmDialog() из components/ui. */}
      <Toaster />
      <ConfirmHost />
    </>
  );
}
