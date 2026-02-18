'use client';

/** Theme is applied by inline script in layout.tsx (beforeInteractive).
 * This component is a no-op to avoid hydration issues from mutating DOM during hydration. */
export function ThemeInit() {
  return null;
}
