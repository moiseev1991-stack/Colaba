'use client';

import Link from 'next/link';
import { Send } from 'lucide-react';
import { buttonClass } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/states';
import { OUTREACH_SENDING_ENABLED } from '@/lib/outreach';

/**
 * Заглушка вместо разделов отправки писем, пока отправка из SpinLid выключена (lib/outreach.ts).
 * Подключается в layout.tsx разделов: /app/email/*, «Каналы рассылки», «Провайдеры email».
 */
export function SendingGate({ children }: { children: React.ReactNode }) {
  if (OUTREACH_SENDING_ENABLED) return <>{children}</>;

  return (
    <PageContainer>
      <EmptyState
        icon={<Send className="h-6 w-6" aria-hidden />}
        title="Отправка писем скоро появится"
        description="Сейчас SpinLid готовит письма, а отправляете их вы — со своей почты или из CRM. Черновики есть в карточке каждой компании и в партиях КП."
        action={
          <Link href="/app/leads" className={buttonClass({ variant: 'secondary' })}>
            К поиску лидов
          </Link>
        }
      />
    </PageContainer>
  );
}
