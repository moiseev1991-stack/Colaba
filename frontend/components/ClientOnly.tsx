'use client';

import { useState, useEffect } from 'react';

/**
 * Renders children only on the client after mount.
 * Prevents hydration mismatch by not rendering interactive content on the server.
 * Use when hydration errors (#418, #423, HierarchyRequestError) persist.
 */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
