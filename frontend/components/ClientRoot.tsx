'use client';

import { useState, useEffect } from 'react';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppShell } from '@/components/AppShell';

const LoadingPlaceholder = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <span className="text-gray-500 dark:text-gray-400">Загрузка...</span>
  </div>
);

const isDev = process.env.NODE_ENV === 'development';

/**
 * In dev: render app immediately (no hydration workaround).
 * In prod: loading until mount → avoids React #418/#423, HierarchyRequestError.
 */
export function ClientRoot({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(isDev);

  useEffect(() => {
    if (!isDev) setMounted(true);
  }, []);

  if (!mounted) {
    return <LoadingPlaceholder />;
  }

  return (
    <>
      <div id="portal-root" />
      <AppErrorBoundary>
        <AppShell>{children}</AppShell>
      </AppErrorBoundary>
    </>
  );
}
