'use client';

import { ModuleProvider } from '@/lib/ModuleContext';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleProvider>
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'hsl(var(--bg))' }}>
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <footer className="shrink-0 py-2 px-4 text-center text-[12px]" style={{ color: 'hsl(var(--muted))', borderTop: '1px solid hsl(var(--border))' }}>
        © SpinLid
      </footer>
    </div>
    </ModuleProvider>
  );
}
