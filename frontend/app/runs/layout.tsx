'use client';

import { SuperuserGate } from '@/components/SuperuserGate';

/** /runs (SEO-запуски) — служебная страница старого интерфейса: только суперюзер. */
export default function RunsLayout({ children }: { children: React.ReactNode }) {
  return <SuperuserGate>{children}</SuperuserGate>;
}
