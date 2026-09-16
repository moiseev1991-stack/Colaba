'use client';

import { RequestMonitorTable } from '@/components/RequestMonitorTable';
import { PageHeader } from '@/components/PageHeader';
import { SuperuserGate } from '@/components/SuperuserGate';

export default function MonitorPage() {
  return (
    <SuperuserGate>
      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 overflow-x-hidden">
        <PageHeader
          breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Request Monitor' }]}
          title="Request Monitor"
        />
        <RequestMonitorTable />
      </div>
    </SuperuserGate>
  );
}
