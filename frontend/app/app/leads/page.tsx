'use client';

/**
 * /app/leads — «Поиск» (вид Premium, 16.09): поиск компаний по картам и выдача.
 * Поиск по вхождению на сайтах открывается по ?tab=sites — ссылкой из «Тонкой настройки».
 * Кнопки «Мои пресеты / Мои списки» над формой убраны: списки — в верхнем меню, пресеты —
 * чипами на странице и в меню профиля.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { MapsSearchPanel } from '@/components/maps/MapsSearchPanel';
import { SiteLeadsPanel } from '@/components/sites/SiteLeadsPanel';
import { PageContainer } from '@/components/ui/page';

function LeadsPageInner() {
  const searchParams = useSearchParams();

  if (searchParams?.get('tab') === 'sites') {
    return (
      <PageContainer className="pb-16 pt-10 sm:pt-16">
        <div className="mx-auto w-full max-w-[1072px]">
          <SiteLeadsPanel />
        </div>
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
