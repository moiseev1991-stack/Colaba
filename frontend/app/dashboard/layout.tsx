'use client';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { SuperuserGate } from '@/components/SuperuserGate';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperuserGate>
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </SuperuserGate>
  );
}
