'use client';

import { BlacklistManager } from '@/components/BlacklistManager';
import { PageHeader } from '@/components/PageHeader';

export default function LeadsBlacklistPage() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 overflow-x-hidden">
      <PageHeader
        breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Лиды', href: '/app/leads' }, { label: 'Чёрный список' }]}
        title="Чёрный список доменов"
      />
      <BlacklistManager />
    </div>
  );
}
