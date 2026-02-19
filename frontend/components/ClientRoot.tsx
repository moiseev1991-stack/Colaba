'use client';

import { useState, useEffect } from 'react';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppShell } from '@/components/AppShell';

const LoadingPlaceholder = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <span className="text-gray-500 dark:text-gray-400">Загрузка...</span>
  </div>
);

/**
 * Renders a loading state until client mount, then the full app.
 * Server and first client render are identical → no hydration mismatch.
 * Avoids React #418/#423, HierarchyRequestError in production.
 */
export function ClientRoot({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
