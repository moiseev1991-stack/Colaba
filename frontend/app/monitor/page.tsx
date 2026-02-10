'use client';

import { RequestMonitorTable } from '@/components/RequestMonitorTable';
import { PageHeader } from '@/components/PageHeader';

export default function MonitorPage() {
  return (
    <div className="max-w-[1250px] mx-auto px-4 sm:px-6 overflow-x-hidden">
      <PageHeader breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Request Monitor' }]} title="Request Monitor" />
      <RequestMonitorTable />
    </div>
  );
}
