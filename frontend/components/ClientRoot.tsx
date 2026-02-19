'use client';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppShell } from '@/components/AppShell';

/**
 * Render app immediately. Loading delay caused white screen in prod.
 * If hydration errors return, we'll address separately.
 */
export function ClientRoot({ children }: { children: React.ReactNode }) {

  return (
    <>
      <div id="portal-root" />
      <AppErrorBoundary>
        <AppShell>{children}</AppShell>
      </AppErrorBoundary>
    </>
  );
}
