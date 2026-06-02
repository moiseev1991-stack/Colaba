'use client';

/**
 * Skeleton — shimmer-плейсхолдер (§3 ТЗ редизайна 2026-06-03).
 * Использовать вместо спиннеров на загрузке карточек/таблиц/метрик —
 * пустоты ощущаются как «зависло», skeleton — как «грузится».
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

export function Skeleton({ className, rounded = 'sm', ...rest }: Props) {
  const radius =
    rounded === 'full' ? 'rounded-full' :
    rounded === 'lg' ? 'rounded-v2-lg' :
    rounded === 'md' ? 'rounded-v2' :
    'rounded-v2-sm';
  return <div className={cn('skel-v2', radius, className)} {...rest} />;
}
