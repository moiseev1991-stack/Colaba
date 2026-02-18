'use client';

import { useLayoutEffect } from 'react';
import { getTheme, setTheme } from '@/lib/storage';

export function ThemeInit() {
  useLayoutEffect(() => {
    const theme = getTheme();
    setTheme(theme);
  }, []);
  return null;
}
