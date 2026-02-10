'use client';

import { useEffect } from 'react';
import { getTheme, setTheme } from '@/lib/storage';

export function ThemeInit() {
  useEffect(() => {
    const theme = getTheme();
    setTheme(theme);
  }, []);
  return null;
}
