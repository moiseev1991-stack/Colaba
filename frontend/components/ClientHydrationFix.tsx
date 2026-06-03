'use client';

import { useState, useEffect } from 'react';

/**
 * Renders children only after client mount.
 * Avoids hydration: server sends empty div, client mounts full app.
 * No server/client mismatch = no React #418/#423.
 */
export function ClientHydrationFix({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return (
      <div
        id="app-loading"
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'hsl(var(--bg))' }}
        suppressHydrationWarning
      >
        <span style={{ color: 'hsl(var(--muted))' }}>Загрузка...</span>
      </div>
    );
  }
  return <>{children}</>;
}
