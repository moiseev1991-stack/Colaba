'use client';

import Link from 'next/link';
import { ModuleProvider, useModule, MODULE_ORDER, MODULE_LABELS, DISABLED_MODULES } from '@/lib/ModuleContext';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';
import { MobileTabBar } from './MobileTabBar';

const LEGAL_LINKS = [
  { href: '/terms', label: 'Соглашение' },
  { href: '/policy', label: 'Политика' },
  { href: '/consent', label: 'Согласие на ПДн' },
  { href: '/offer', label: 'Оферта' },
  { href: '/data-sources', label: 'Источники' },
];
const SUPPORT_EMAIL = 'support@spinlid.ru';

function MobileModuleTabs() {
  const { module, setModule } = useModule();

  return (
    <div
      className="md:hidden flex shrink-0 border-b"
      style={{
        backgroundColor: 'hsl(var(--nav-bg) / 0.95)',
        borderColor: 'hsl(var(--border))',
        backdropFilter: 'blur(12px)',
      }}
    >
      {MODULE_ORDER.map((id) => {
        const active = module === id;
        const disabled = DISABLED_MODULES.has(id);
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            onClick={() => { if (!active) setModule(id); }}
            title={disabled ? 'Модуль скоро будет доступен' : undefined}
            className={`relative flex flex-1 items-center justify-center h-10 text-[13px] font-medium transition-colors ${
              disabled ? 'cursor-not-allowed opacity-50' : ''
            }`}
            style={{
              color: active ? 'hsl(var(--nav-active-text))' : 'hsl(var(--nav-text))',
              background: active ? 'hsl(var(--nav-active-bg))' : undefined,
            }}
          >
            {MODULE_LABELS[id]}
            {active && (
              <span
                className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                style={{ background: 'var(--brand-gradient)' }}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleProvider>
      <div className="flex min-h-screen flex-col app-bg-gradient app-grid-pattern">
        <div className="app-orb app-orb-1" aria-hidden="true" />
        <div className="app-orb app-orb-2" aria-hidden="true" />

        <AppHeader />
        <MobileModuleTabs />

        <div className="flex flex-1 min-w-0 overflow-hidden relative z-10">
          {/* Sidebar только на md+. На мобиле навигация полностью через
              MobileModuleTabs (сверху) + MobileTabBar (снизу) — иначе
              icon-rail 72px наезжал на контент карточек на 360-414px. */}
          <div className="hidden md:flex">
            <Sidebar />
          </div>
          {/* pb-20 на мобайле — чтоб содержимое не уезжало под MobileTabBar (56px + safe-area). */}
          <main className="app-main flex-1 min-w-0 overflow-auto pb-20 md:pb-0">
            {children}
          </main>
        </div>

        <footer
          className="app-footer hidden md:block shrink-0 py-2.5 px-4 text-[12px] relative z-10 backdrop-blur-sm"
          style={{
            color: 'hsl(var(--muted))',
            borderTop: '1px solid hsl(var(--border))',
            background: 'hsl(var(--surface) / 0.8)',
          }}
        >
          <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5">
            <span suppressHydrationWarning>© {new Date().getFullYear()} SpinLid</span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:underline" target="_blank">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </footer>

        {/* §2.3 — мобильная нижняя навигация. Только md-, на десктопе — sidebar. */}
        <MobileTabBar />
      </div>
    </ModuleProvider>
  );
}
