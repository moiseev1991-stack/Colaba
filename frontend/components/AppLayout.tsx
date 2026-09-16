'use client';

import Link from 'next/link';
import { LEGAL_LINKS, SUPPORT_EMAIL } from '@/lib/site';
import { ModuleProvider } from '@/lib/ModuleContext';
import { AppHeader } from './AppHeader';
import { MobileTabBar } from './MobileTabBar';
import { VersionBadge } from './VersionBadge';
import { useAccount } from './nav/useAccount';

/**
 * Каркас кабинета (вид Premium, 16.09): липкая верхняя шапка с разделами, белый фон,
 * контент на всю ширину. На телефоне — нижние вкладки. Боковое меню убрано.
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, logout } = useAccount();

  return (
    <ModuleProvider>
      <div className="flex min-h-screen flex-col bg-ui-bg">
        <AppHeader email={email} onLogout={logout} />

        {/* pb-20 на мобайле — чтобы содержимое не уезжало под нижние вкладки (56px + safe-area). */}
        <main className="app-main min-w-0 flex-1 pb-20 md:pb-0">{children}</main>

        <footer className="app-footer hidden shrink-0 border-t border-black/[.06] text-xs text-ui-text-muted md:block">
          <div className="mx-auto flex w-full max-w-[1232px] flex-wrap items-center gap-x-5 gap-y-1.5 px-6 py-4">
            <span suppressHydrationWarning>© {new Date().getFullYear()} SpinLid</span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-ui-text hover:underline" target="_blank">
                    {l.short}
                  </Link>
                </li>
              ))}
            </ul>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-ui-text hover:underline">
              {SUPPORT_EMAIL}
            </a>
            <span className="ml-auto">
              <VersionBadge />
            </span>
          </div>
        </footer>

        <MobileTabBar email={email} onLogout={logout} />
      </div>
    </ModuleProvider>
  );
}
