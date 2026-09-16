'use client';

import { BlacklistManager } from '@/components/BlacklistManager';
import { PageContainer, PageHeader } from '@/components/ui/page';

export default function BlacklistPage() {
  return (
    <PageContainer className="overflow-x-hidden">
      <PageHeader
        breadcrumbs={[{ label: 'Главная', href: '/' }, { label: 'Blacklist' }]}
        title="Blacklist"
      />
      <BlacklistManager />
    </PageContainer>
  );
}
