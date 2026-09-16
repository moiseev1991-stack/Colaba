'use client';

/**
 * /app/leads — «Поиск» (вид Premium, 16.09): поиск компаний по картам и выдача.
 * Поиск по вхождению на сайтах открывается по ?tab=sites — ссылкой из «Тонкой настройки».
 * Кнопки «Мои пресеты / Мои списки» над формой убраны: списки — в верхнем меню, пресеты —
 * чипами на странице и в меню профиля.
 */

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { MapsSearchPanel } from '@/components/maps/MapsSearchPanel';
import { SiteLeadsPanel } from '@/components/sites/SiteLeadsPanel';
import { PageContainer, PageHeader } from '@/components/ui/page';

function LeadsPageInner() {
  const searchParams = useSearchParams();

  if (searchParams?.get('tab') === 'sites') {
    return (
      <PageContainer className="max-w-[1048px]">
        <Link href="/app/leads" className="mb-4 inline-flex items-center gap-1.5 text-small font-semibold text-ui-text-muted hover:text-ui-text">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Поиск по картам
        </Link>
        <PageHeader title="Поиск по сайтам." description="Компании, на сайтах которых встречаются нужные слова, — с кнопкой «КП» на карточке." />
        <SiteLeadsPanel />
      </PageContainer>
    );
  }

  return <MapsSearchPanel />;
}

export default function LeadsPage() {
  // Suspense нужен, потому что страница и MapsSearchPanel читают useSearchParams
  // (?tab, ?map_search_id); без него Next.js падает на prerender.
  return (
    <Suspense fallback={null}>
      <LeadsPageInner />
    </Suspense>
  );
}
