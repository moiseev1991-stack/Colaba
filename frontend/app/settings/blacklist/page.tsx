'use client';

import { BlacklistManager } from '@/components/BlacklistManager';
import { PageHeader } from '@/components/PageHeader';

export default function BlacklistPage() {
  return (
    <div className="max-w-[1250px] mx-auto px-4 sm:px-6 overflow-x-hidden">
      <PageHeader breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Blacklist' }]} title="Blacklist" />
      <BlacklistManager />
    </div>
  );
}
