'use client';

import { useRouter, usePathname } from 'next/navigation';
import { ModuleProvider } from '@/lib/ModuleContext';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';
import type { ModuleId } from '@/lib/ModuleContext';

const MODULES: { id: ModuleId; label: string }[] = [
  { id: 'seo', label: 'SEO' },
  { id: 'leads', label: 'Поиск лидов' },
  { id: 'tenders', label: 'Госзакупки' },
];

function getModuleFromPath(pathname: string | null): ModuleId | null {
  if (!pathname) return null;
  if (pathname === '/dashboard') return null;
  if (pathname.startsWith('/seo') || pathname.startsWith('/app/seo') || pathname.startsWith('/runs') || pathname.startsWith('/settings')) return 'seo';
  if (pathname.startsWith('/leads') || pathname.startsWith('/app/leads')) return 'leads';
  if (pathname.startsWith('/tenders') || pathname.startsWith('/app/gos')) return 'tenders';
  return null;
}

function MobileModuleTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const currentModule = getModuleFromPath(pathname);

  const goToModule = (id: ModuleId) => {
    const routes: Record<ModuleId, string> = {
      seo: '/dashboard',
      leads: '/app/leads',
      tenders: '/app/gos',
    };
    router.push(routes[id]);
  };

  return (
    <div
      className="md:hidden flex shrink-0 border-b"
      style={{
        backgroundColor: 'hsl(var(--nav-bg) / 0.95)',
        borderColor: 'hsl(var(--border))',
        backdropFilter: 'blur(12px)',
      }}
    >
      {MODULES.map((m) => {
        const active = currentModule === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => goToModule(m.id)}
            className="relative flex flex-1 items-center justify-center h-10 text-[13px] font-medium transition-colors"
            style={{
              color: active ? 'hsl(var(--nav-active-text))' : 'hsl(var(--nav-text))',
              background: active ? 'hsl(var(--nav-active-bg))' : undefined,
            }}
          >
            {m.label}
            {active && (
              <span
                className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                style={{ background: 'var(--grad-accent)' }}
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
        {/* Decorative orbs */}
        <div className="app-orb app-orb-1" aria-hidden="true" />
        <div className="app-orb app-orb-2" aria-hidden="true" />

        <AppHeader />

        {/* Module switcher tab row — mobile only */}
        <MobileModuleTabs />

        <div className="flex flex-1 overflow-hidden relative z-10">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>

        <footer
          className="shrink-0 py-3 px-4 text-center text-[12px] relative z-10 backdrop-blur-sm"
          style={{
            color: 'hsl(var(--muted))',
            borderTop: '1px solid hsl(var(--border))',
            background: 'hsl(var(--surface) / 0.8)',
          }}
        >
          © SpinLid
        </footer>
      </div>
    </ModuleProvider>
  );
}
