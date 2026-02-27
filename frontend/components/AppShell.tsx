'use client';

import { usePathname } from 'next/navigation';
import { ThemeInit } from './ThemeInit';
import { AppLayout } from './AppLayout';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  const isAuthPage = pathname?.startsWith('/auth/');
  const useAppLayout = !isLanding && !isAuthPage;

  return (
    <>
      <ThemeInit />
      {useAppLayout ? <AppLayout>{children}</AppLayout> : children}
    </>
  );
}
