'use client';

import { RazborTemplate } from '@/components/razbor/RazborTemplate';
import { OCHEREDI } from '@/components/razbor/config';

// B · очереди/ожидание. Вёрстка и логика — в RazborTemplate.
export default function RazborOcherediPage() {
  return <RazborTemplate config={OCHEREDI} />;
}
