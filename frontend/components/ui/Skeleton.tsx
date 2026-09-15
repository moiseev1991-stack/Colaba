'use client';

/**
 * Skeleton — мерцающий плейсхолдер загрузки. Пустота ощущается как «зависло»,
 * скелетон — как «грузится». Скругления — ступени PR 3.1: control / card / panel.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const RADIUS = {
  sm: 'rounded-control',
  md: 'rounded-card',
  lg: 'rounded-panel',
  full: 'rounded-full',
} as const;

export function Skeleton({ className, rounded = 'sm', ...rest }: Props) {
  return <div className={cn('skel-v2', RADIUS[rounded], className)} aria-hidden {...rest} />;
}
