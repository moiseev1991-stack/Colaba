'use client';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppShell } from '@/components/AppShell';

/**
 * Client-only root. SSR is disabled at layout level via dynamic import.
 */
export function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <div id="app-root">
      <div id="portal-root" />
      <AppErrorBoundary>
        <AppShell>{children}</AppShell>
      </AppErrorBoundary>
    </div>
  );
}
