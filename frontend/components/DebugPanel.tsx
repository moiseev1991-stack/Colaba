'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { tokenStorage } from '@/client';
import { getTheme } from '@/lib/storage';

/** Dev-only debug block. Remove or gate behind feature flag for production. */
export function DebugPanel() {
  const [mounted, setMounted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ message?: string }>).detail;
      setLastError(d?.message ?? 'API error');
    };
    window.addEventListener('api-error', handler);
    return () => window.removeEventListener('api-error', handler);
  }, []);

  if (process.env.NODE_ENV !== 'development' || !mounted) return null;

  const token = tokenStorage.getAccessToken();
  const theme = getTheme();
  const currentModule =
    pathname?.startsWith('/app/seo') || pathname?.startsWith('/runs')
      ? 'seo'
      : pathname?.startsWith('/app/leads')
        ? 'leads'
        : pathname?.startsWith('/app/gos')
          ? 'tenders'
          : 'unknown';

  return (
    <div
      className="fixed bottom-2 left-2 z-[9999] max-w-[280px] rounded-v2-sm border p-3 text-[11px] font-mono shadow-v2 backdrop-blur"
      style={{
        background: 'hsl(var(--surface) / 0.95)',
        borderColor: 'hsl(var(--border))',
        color: 'hsl(var(--text))',
      }}
    >
      <div className="font-semibold mb-2" style={{ color: 'hsl(var(--muted))' }}>Debug</div>
      <div>Auth: {token ? 'loggedIn' : 'no token'}</div>
      <div>Theme: {theme}</div>
      <div>Module: {currentModule}</div>
      {lastError && (
        <div className="truncate" style={{ color: 'var(--signal-hot)' }} title={lastError}>
          Last error: {lastError}
        </div>
      )}
    </div>
  );
}
