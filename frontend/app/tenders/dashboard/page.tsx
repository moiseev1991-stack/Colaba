'use client';

import { ModuleDashboard } from '@/components/ModuleDashboard';

export default function TendersDashboardPage() {
  return <ModuleDashboard module="tenders" title="Дашборд: Госзакупки" runBaseUrl="/runs" />;
}
