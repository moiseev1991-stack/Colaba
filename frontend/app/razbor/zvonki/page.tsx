'use client';

import { RazborTemplate } from '@/components/razbor/RazborTemplate';
import { ZVONKI } from '@/components/razbor/config';

// A · дозвон/запись. Вёрстка и логика — в RazborTemplate.
export default function RazborZvonkiPage() {
  return <RazborTemplate config={ZVONKI} />;
}
