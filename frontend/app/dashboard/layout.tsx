'use client';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppErrorBoundary>{children}</AppErrorBoundary>;
}
