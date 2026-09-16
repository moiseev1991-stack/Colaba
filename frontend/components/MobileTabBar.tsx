'use client';

/**
 * MobileTabBar — единственная навигация кабинета на телефоне (вид Premium, 16.09):
 * четыре раздела из верхнего меню и «Ещё» — лист со всем остальным (меню профиля).
 * Бургер и верхние вкладки модулей убраны.
 *
 * safe-area iOS — паддинг снизу через .safe-pb. Только на мобайле (md:hidden).
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { NavMenuList } from '@/components/nav/NavMenuList';
import { MOBILE_TABS, PRIMARY_NAV, allNavItems, getBestMatch, menuSectionsFor } from '@/components/nav/appNav';
import { useIsSuperuser } from '@/lib/useIsSuperuser';
import { LEGAL_LINKS, SUPPORT_EMAIL } from '@/lib/site';
import { cn } from '@/lib/utils';

export function MobileTabBar({ email, onLogout }: { email: string | null; onLogout: () => void }) {
  const pathname = usePathname();
  const isSuperuser = useIsSuperuser();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeHref = getBestMatch(pathname, allNavItems(isSuperuser));
  const tabActive = MOBILE_TABS.some((t) => t.href === activeHref);
  // «Шаблоны КП» не влезли во вкладки — показываем их первым пунктом листа «Ещё».
  const extra = PRIMARY_NAV.filter((item) => !MOBILE_TABS.includes(item));
  const sections = [{ title: 'Разделы', items: extra }, ...menuSectionsFor(isSuperuser)];

  const tabClass = (active: boolean) =>
    cn(
      'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors',
      active ? 'text-ui-accent' : 'text-ui-text-muted hover:text-ui-text',
    );

  return (
    <>
      <nav
        aria-label="Основная навигация"
        className="safe-pb fixed bottom-0 left-0 right-0 z-30 border-t border-black/[.06] bg-white/90 backdrop-blur-xl md:hidden"
      >
        <div className="flex">
          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.href === activeHref;
            return (
              <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                <span className={cn('grid h-7 w-12 place-items-center rounded-full', active && 'bg-ui-accent/10')}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={tabClass(!tabActive && activeHref !== null)}
          >
            <span className={cn('grid h-7 w-12 place-items-center rounded-full', !tabActive && activeHref !== null && 'bg-ui-accent/10')}>
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </span>
            Ещё
          </button>
        </div>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Меню">
        <NavMenuList
          large
          sections={sections}
          activeHref={activeHref}
          email={email}
          onNavigate={() => setMoreOpen(false)}
          onLogout={() => {
            setMoreOpen(false);
            onLogout();
          }}
        />
        <div className="mt-3 border-t border-ui-border px-3 pt-3 text-xs text-ui-text-muted">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} target="_blank" className="hover:underline">
                {l.short}
              </Link>
            ))}
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1.5 block hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </div>
      </BottomSheet>
    </>
  );
}
