import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArticleShell } from '@/components/content/ArticleShell';
import { SITE_ORIGIN, articlePath, articlesIn, getArticle } from '@/lib/content';

export const dynamicParams = false;

export function generateStaticParams() {
  return articlesIn('issledovaniya').map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const a = getArticle('issledovaniya', params.slug);
  if (!a) return {};
  const url = `${SITE_ORIGIN}${articlePath(a)}`;
  return {
    title: a.title,
    description: a.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: a.h1,
      description: a.description,
      url,
      publishedTime: a.published,
      modifiedTime: a.updated,
    },
  };
}

export default function Page({ params }: { params: { slug: string } }) {
  const a = getArticle('issledovaniya', params.slug);
  if (!a) notFound();
  return <ArticleShell article={a} />;
}
