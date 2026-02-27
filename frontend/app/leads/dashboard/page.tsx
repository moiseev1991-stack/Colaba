'use client';

import { ModuleDashboard } from '@/components/ModuleDashboard';

export default function LeadsDashboardPage() {
  return <ModuleDashboard module="leads" title="Дашборд: Поиск лидов" runBaseUrl="/runs" />;
}
