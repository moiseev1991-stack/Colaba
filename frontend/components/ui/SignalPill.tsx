import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeProps, type BadgeTone } from './badge';

/**
 * @deprecated SignalPill — обёртка над Badge (PR 3.3); в новом коде используйте Badge.
 * Тона сигналов сведены к тонам Badge: hot → danger, warm → warning, cool → info,
 * good → success, muted → neutral; accent — сплошной изумруд для главного сигнала.
 */
export type SignalTone = 'hot' | 'warm' | 'cool' | 'good' | 'muted' | 'accent';

const TONE: Record<SignalTone, BadgeTone> = {
  hot: 'danger',
  warm: 'warning',
  cool: 'info',
  good: 'success',
  muted: 'neutral',
  accent: 'accent',
};

export function SignalPill({ tone = 'muted', className, ...rest }: Omit<BadgeProps, 'tone'> & { tone?: SignalTone }) {
  return (
    <Badge
      tone={TONE[tone]}
      className={cn(tone === 'accent' && 'bg-ui-accent text-ui-accent-contrast ring-0', className)}
      {...rest}
    />
  );
}
