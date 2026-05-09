'use client';

import { ModuleProvider, useModule, MODULE_ORDER, MODULE_LABELS, DISABLED_MODULES } from '@/lib/ModuleContext';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';

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
        <div className="app-orb app-orb-1" aria-hidden="true" />
        <div className="app-orb app-orb-2" aria-hidden="true" />

        <AppHeader />
        <MobileModuleTabs />

        <div className="flex flex-1 min-w-0 overflow-hidden relative z-10">
          <Sidebar />
          <main className="app-main flex-1 min-w-0 overflow-auto">
            {children}
          </main>
        </div>

        <footer
          className="app-footer hidden md:block shrink-0 py-3 px-4 text-center text-[12px] relative z-10 backdrop-blur-sm"
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
