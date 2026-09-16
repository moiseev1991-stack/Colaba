'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { buttonClass } from '@/components/ui/button';
import { NavMenuList } from '@/components/nav/NavMenuList';
import { PRIMARY_NAV, allNavItems, getBestMatch, menuSectionsFor } from '@/components/nav/appNav';
import { useIsSuperuser } from '@/lib/useIsSuperuser';
import { cn } from '@/lib/utils';

/**
 * Шапка кабинета (вид Premium, 16.09): логотип, основные разделы, «Купить подписку»
 * и меню профиля со всем остальным. Липкая, полупрозрачная. На телефоне разделы —
 * в нижних вкладках (MobileTabBar), здесь остаются логотип и меню профиля.
 */
export function AppHeader({ email, onLogout }: { email: string | null; onLogout: () => void }) {
  const pathname = usePathname();
  const isSuperuser = useIsSuperuser();
  const activeHref = getBestMatch(pathname, allNavItems(isSuperuser));

  return (
    <header className="sticky top-0 z-40 border-b border-black/[.06] bg-white/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 w-full max-w-[1232px] items-center gap-8 px-4 sm:px-6">
        <Link
          href="/app/leads"
          aria-label="SpinLid — к поиску"
          className="flex shrink-0 items-center gap-2 rounded-control"
        >
          <BrandMark
            size={28}
            gradient="linear-gradient(135deg, #34d399 0%, #059669 100%)"
            glow="none"
          />
          <span className="text-base font-bold tracking-tight text-ui-text">SpinLid</span>
        </Link>

        <nav aria-label="Разделы" className="hidden items-center gap-6 md:flex">
          {PRIMARY_NAV.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-control py-1 text-small transition-colors',
                  active ? 'font-semibold text-ui-text' : 'text-ui-text-muted hover:text-ui-text',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/#pricing"
            className={buttonClass({ variant: 'secondary', size: 'sm', className: 'gap-1.5' })}
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Купить подписку</span>
            <span className="sr-only sm:hidden">Купить подписку</span>
          </Link>
          <ProfileMenu
            email={email}
            isSuperuser={isSuperuser}
            activeHref={activeHref}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
}

function ProfileMenu({
  email,
  isSuperuser,
  activeHref,
  onLogout,
}: {
  email: string | null;
  isSuperuser: boolean;
  activeHref: string | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = (email?.trim()[0] ?? '').toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Меню профиля"
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          'grid h-9 w-9 place-items-center rounded-full bg-ui-surface-2 text-sm font-semibold text-ui-text transition-colors hover:bg-ui-border',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40',
        )}
      >
        {initial || <span className="h-2 w-2 rounded-full bg-ui-text-muted" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto rounded-card border border-black/[.06] bg-ui-surface p-1.5 shadow-overlay">
          <NavMenuList
            sections={menuSectionsFor(isSuperuser)}
            activeHref={activeHref}
            email={email}
            onNavigate={() => setOpen(false)}
            onLogout={() => {
              setOpen(false);
              onLogout();
            }}
          />
        </div>
      )}
    </div>
  );
}
