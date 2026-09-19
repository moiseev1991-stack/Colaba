import type { Metadata } from 'next';

import { SectionHub } from '@/components/content/SectionHub';
import { SECTION_META, SITE_ORIGIN } from '@/lib/content';

const META = SECTION_META['issledovaniya'];

export const metadata: Metadata = {
  title: META.title,
  description: META.description,
  alternates: { canonical: `${SITE_ORIGIN}${META.path}` },
  openGraph: { title: META.h1, description: META.description, url: `${SITE_ORIGIN}${META.path}` },
};

export default function Page() {
  return (
    <SectionHub
      section="issledovaniya"
      intro="Мы собираем публичные отзывы о компаниях с 2GIS, Яндекс.Карт и Google Maps и считаем, на что клиенты жалуются чаще всего — по нишам и городам России. Цифры, цитаты и методология открыты: исследования можно цитировать со ссылкой на SpinLid."
    />
  );
}
