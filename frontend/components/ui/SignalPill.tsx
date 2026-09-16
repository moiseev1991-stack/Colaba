import * as React from 'react';
import { Badge, type BadgeProps, type BadgeTone } from './badge';

/**
 * @deprecated SignalPill — обёртка над Badge (PR 3.3); в новом коде используйте Badge.
 * Чистый маппинг 1:1 на Badge без дополнительных стилей: hot → danger,
 * warm → warning, cool → info, good → success, muted → neutral, accent → accent.
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

export function SignalPill({
  tone = 'muted',
  ...rest
}: Omit<BadgeProps, 'tone'> & { tone?: SignalTone }) {
  return <Badge tone={TONE[tone]} {...rest} />;
}
