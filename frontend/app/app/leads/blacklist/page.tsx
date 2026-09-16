'use client';

import { BlacklistManager } from '@/components/BlacklistManager';
import { PageContainer, PageColumn, PageHeader } from '@/components/ui/page';

export default function LeadsBlacklistPage() {
  return (
    <PageContainer className="overflow-x-hidden">
      <PageColumn>
        <PageHeader
          breadcrumbs={[
            { label: 'Главная', href: '/' },
            { label: 'Лиды', href: '/app/leads' },
            { label: 'Чёрный список' },
          ]}
          title="Чёрный список доменов"
        />
        <BlacklistManager />
      </PageColumn>
    </PageContainer>
  );
}
