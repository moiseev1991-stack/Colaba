'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const AppShell = dynamic(() => import('@/components/AppShell').then(m => m.AppShell), {
  ssr: false,
});

const AppErrorBoundary = dynamic(
  () => import('@/components/AppErrorBoundary').then(m => m.AppErrorBoundary),
  { ssr: false }
);

/**
 * Client-only rendering to avoid hydration mismatch.
 * Shows loading state until client is ready.
 */
export function ClientRoot({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a0a',
        color: '#888'
      }}>
        Загрузка...
      </div>
    );
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
