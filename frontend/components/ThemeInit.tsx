'use client';

import { useEffect } from 'react';
import { getTheme, setTheme } from '@/lib/storage';

/** Apply theme after hydration to avoid React #418/#423. No DOM mutation before React mounts. */
export function ThemeInit() {
  useEffect(() => {
    setTheme(getTheme());
  }, []);
  return null;
}
