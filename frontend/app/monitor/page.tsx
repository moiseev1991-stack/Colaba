'use client';

import { RequestMonitorTable } from '@/components/RequestMonitorTable';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { SuperuserGate } from '@/components/SuperuserGate';

export default function MonitorPage() {
  return (
    <SuperuserGate>
      <PageContainer className="overflow-x-hidden">
        <PageHeader
          breadcrumbs={[{ label: 'Главная', href: '/' }, { label: 'Request Monitor' }]}
          title="Request Monitor"
        />
        <RequestMonitorTable />
      </PageContainer>
    </SuperuserGate>
  );
}
