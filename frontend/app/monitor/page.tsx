'use client';

import { RequestMonitorTable } from '@/components/RequestMonitorTable';

export default function MonitorPage() {
  return (
    <div className="max-w-[1250px] mx-auto px-6 py-6">
      <RequestMonitorTable />
    </div>
  );
}
