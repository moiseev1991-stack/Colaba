'use client';

import { RazborTemplate } from '@/components/razbor/RazborTemplate';
import { ZAKAZY } from '@/components/razbor/config';

// D1 · статус заказа. Вёрстка и логика — в RazborTemplate.
export default function RazborZakazyPage() {
  return <RazborTemplate config={ZAKAZY} />;
}
