import type { Metadata } from 'next';

import { SectionHub } from '@/components/content/SectionHub';
import { SECTION_META, SITE_ORIGIN } from '@/lib/content';

const META = SECTION_META['stati'];

export const metadata: Metadata = {
  title: META.title,
  description: META.description,
  alternates: { canonical: `${SITE_ORIGIN}${META.path}` },
  openGraph: { title: META.h1, description: META.description, url: `${SITE_ORIGIN}${META.path}` },
};

export default function Page() {
  return (
    <SectionHub
      section="stati"
      intro="Практические статьи для веб-студий, агентств и B2B-продавцов: где взять базу компаний, как найти клиентов, как написать письмо и коммерческое предложение под боль клиента и что говорит закон о холодных рассылках."
    />
  );
}
