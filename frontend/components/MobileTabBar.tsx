'use client';

/**
 * MobileTabBar — нижняя навигация для мобайла (§2.3 ТЗ редизайна 2026-06-03).
 *
 * 4 главных пункта: Поиск / Дашборд / История / Профиль. Активный — бренд-цвет
 * с лёгкой подсветкой. Прячется при открытом drawer/bottom-sheet (через z-index).
 * «Кампании» заменены на «Историю» 15.09: Email-рассылка скрыта от клиентов.
 *
 * safe-area iOS — паддинг снизу через max(8px, env(safe-area-inset-bottom)).
 * Только на мобайле (md:hidden); десктоп использует Sidebar.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { History, LayoutDashboard, Search, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Префиксы путей, при которых таб считается активным. */
  matches: string[];
}

const TABS: Tab[] = [
  { href: '/app/leads',           label: 'Поиск',     icon: Search,          matches: ['/app/leads'] },
  { href: '/leads/dashboard',     label: 'Дашборд',   icon: LayoutDashboard, matches: ['/leads/dashboard', '/dashboard'] },
  { href: '/app/leads/history',   label: 'История',   icon: History,         matches: ['/app/leads/history'] },
  { href: '/profile',             label: 'Профиль',   icon: User,            matches: ['/profile', '/settings'] },
];

/** Активный таб — с самым длинным совпавшим префиксом («История» внутри «Поиска»). */
function activeTabHref(pathname: string | null): string | null {
  if (!pathname) return null;
  let best: { href: string; len: number } | null = null;
  for (const tab of TABS) {
    for (const m of tab.matches) {
      if (pathname.startsWith(m) && (!best || m.length > best.len)) best = { href: tab.href, len: m.length };
    }
  }
  return best?.href ?? null;
}

export function MobileTabBar() {
  const pathname = usePathname();
  const activeHref = activeTabHref(pathname);
  return (
    <nav
      role="navigation"
      aria-label="Основная навигация"
      className={cn(
        'md:hidden fixed bottom-0 left-0 right-0 z-30',
        'border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))]/95 backdrop-blur-md',
        'safe-pb'
      )}
    >
      <div className="flex">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.href === activeHref;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-1 min-h-[56px] flex-col items-center justify-center gap-0.5 py-2',
                'text-xs font-medium transition-colors',
                active
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-[hsl(var(--muted))] hover:text-[hsl(var(--text))]'
              )}
            >
              <div className={cn('grid h-7 w-12 place-items-center rounded-full',
                active && 'bg-brand-500/12'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
