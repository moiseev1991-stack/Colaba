'use client';

import { ModuleDashboard } from '@/components/ModuleDashboard';
import { SuperuserGate } from '@/components/SuperuserGate';

export default function LeadsDashboardPage() {
  return (
    <SuperuserGate>
      <ModuleDashboard module="leads" title="Дашборд: Поиск лидов" runBaseUrl="/runs" />
    </SuperuserGate>
  );
}
