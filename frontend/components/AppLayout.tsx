'use client';

import { ModuleProvider } from '@/lib/ModuleContext';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleProvider>
      <div className="flex min-h-screen flex-col app-bg-gradient app-grid-pattern">
        {/* Decorative orbs */}
        <div className="app-orb app-orb-1" aria-hidden="true" />
        <div className="app-orb app-orb-2" aria-hidden="true" />
        
        <AppHeader />
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
            background: 'hsl(var(--surface) / 0.8)'
          }}
        >
          © SpinLid
        </footer>
      </div>
    </ModuleProvider>
  );
}
