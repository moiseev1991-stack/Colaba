'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { ProposalEditor } from '@/components/ProposalEditor';
import { getTemplate, saveTemplate, type ProposalTemplate } from '@/lib/proposalTemplates';

export default function EditProposalPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const [tpl, setTpl] = useState<ProposalTemplate | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTpl(getTemplate(id));
    setLoaded(true);
  }, [id]);

  if (!loaded) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="h-6 w-40 app-skeleton mb-6" style={{ borderRadius: 4 }} />
        <div className="h-[400px] app-skeleton" style={{ borderRadius: 6 }} />
      </div>
    );
  }

  if (!tpl) {
    return (
      <div className="mx-auto max-w-[600px] px-6 py-12 text-center">
        <div
          className="inline-flex items-center justify-center w-14 h-14 mb-4"
          style={{
            background: 'hsl(var(--danger) / 0.15)',
            border: '1px solid hsl(var(--danger) / 0.3)',
            borderRadius: 6,
          }}
        >
          <AlertCircle className="h-6 w-6" style={{ color: 'hsl(var(--danger))' }} />
        </div>
        <h2 className="text-[18px] font-bold mb-2" style={{ color: 'hsl(var(--text))' }}>
          Шаблон не найден
        </h2>
        <p className="text-[13px] mb-5" style={{ color: 'hsl(var(--muted))' }}>
          Возможно, он был удалён или ссылка устарела.
        </p>
        <Link
          href="/app/leads/proposals"
          className="app-cta-mega inline-flex"
          style={{ height: 40, padding: '0 18px', fontSize: 13 }}
        >
          <ChevronLeft className="h-4 w-4" /> К списку
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <Link
        href="/app/leads/proposals"
        className="inline-flex items-center gap-1 app-mono-label mb-6 transition-colors hover:text-[hsl(var(--accent))]"
        style={{ color: 'hsl(var(--muted))' }}
      >
        <ChevronLeft className="h-3.5 w-3.5" /> к списку шаблонов
      </Link>

      <h1 className="text-[28px] font-extrabold mb-6 tracking-[-0.5px]" style={{ color: 'hsl(var(--text))' }}>
        Редактирование шаблона
      </h1>

      <ProposalEditor
        initial={tpl}
        onSave={(input) => {
          saveTemplate(input);
          router.push('/app/leads/proposals');
        }}
        onCancel={() => router.push('/app/leads/proposals')}
      />
    </div>
  );
}
