'use client';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppShell } from '@/components/AppShell';

export default function AppLayoutRoute({ children }: { children: React.ReactNode }) {
  return (
    <AppErrorBoundary>
      <AppShell>{children}</AppShell>
    </AppErrorBoundary>
  );
}
