'use client';

import { RazborTemplate } from '@/components/razbor/RazborTemplate';
import { GENERAL } from '@/components/razbor/config';

// Общий лендинг /razbor (дозвон/заявки/запись/хаос). Вся вёрстка и логика —
// в RazborTemplate; здесь только выбор конфига группы.
export default function RazborPage() {
  return <RazborTemplate config={GENERAL} />;
}
