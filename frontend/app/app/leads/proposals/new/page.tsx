'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ProposalEditor } from '@/components/ProposalEditor';
import { PageContainer } from '@/components/ui/page';
import { saveTemplate } from '@/lib/proposalTemplates';

export default function NewProposalPage() {
  const router = useRouter();

  return (
    <PageContainer>
      <Link
        href="/app/leads/proposals"
        className="inline-flex items-center gap-1 app-mono-label mb-6 transition-colors hover:text-[hsl(var(--accent))]"
        style={{ color: 'hsl(var(--muted))' }}
      >
        <ChevronLeft className="h-3.5 w-3.5" /> к списку шаблонов
      </Link>

      <h1
        className="text-heading font-extrabold mb-6 tracking-[-0.5px]"
        style={{ color: 'hsl(var(--text))' }}
      >
        Новый шаблон КП
      </h1>

      <ProposalEditor
        onSave={(input) => {
          saveTemplate(input);
          router.push('/app/leads/proposals');
        }}
        onCancel={() => router.push('/app/leads/proposals')}
      />
    </PageContainer>
  );
}
