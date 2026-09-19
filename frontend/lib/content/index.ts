import { SEO_NAV_LINKS } from '@/components/landing/seoNavLinks';
import { GUIDE_ARTICLES } from './articles-guides';
import { QUESTION_ARTICLES } from './articles-questions';
import { RESEARCH_ARTICLES } from './research';
import type { Article, ArticleKind, ArticleSection } from './types';

export type { Article, ArticleBlock, ArticleKind, ArticleSection } from './types';

export const SITE_ORIGIN = 'https://spinlid.ru';

export const ALL_ARTICLES: Article[] = [
  ...RESEARCH_ARTICLES,
  ...QUESTION_ARTICLES,
  ...GUIDE_ARTICLES,
];

export const SECTION_META: Record<
  ArticleSection,
  { path: string; title: string; h1: string; description: string }
> = {
  issledovaniya: {
    path: '/issledovaniya',
    title: 'Исследования SpinLid — на что жалуются клиенты по нишам',
    h1: 'Исследования: на что жалуются клиенты',
    description:
      'Исследования SpinLid на данных тысяч отзывов с 2GIS, Яндекс.Карт и Google Maps: главные жалобы клиентов по нишам и городам России, цитаты и выводы для бизнеса и агентств.',
  },
  stati: {
    path: '/stati',
    title: 'Статьи SpinLid — поиск клиентов, базы компаний, холодные письма',
    h1: 'Статьи: как находить клиентов и писать им',
    description:
      'Практические статьи SpinLid: где взять базу компаний, как найти клиентов веб-студии и агентству, законна ли холодная рассылка, шаблоны писем и КП под боль клиента.',
  },
};

export const KIND_LABEL: Record<ArticleKind, string> = {
  research: 'Исследование',
  question: 'Вопрос-ответ',
  comparison: 'Сравнение',
  guide: 'Инструкция',
};

export function articlePath(a: Pick<Article, 'section' | 'slug'>): string {
  return `${SECTION_META[a.section].path}/${a.slug}`;
}

export function getArticle(section: ArticleSection, slug: string): Article | undefined {
  return ALL_ARTICLES.find((a) => a.section === section && a.slug === slug);
}

export function articlesIn(section: ArticleSection): Article[] {
  return ALL_ARTICLES.filter((a) => a.section === section);
}

/** Путь из related → { href, title, hint } для карточек перелинковки. */
export function resolveRelated(href: string): { href: string; title: string; hint: string } | null {
  const art = ALL_ARTICLES.find((a) => articlePath(a) === href);
  if (art) return { href, title: art.h1, hint: KIND_LABEL[art.kind] };
  const landing = SEO_NAV_LINKS.find((l) => l.href === href);
  if (landing) return { href, title: landing.label, hint: landing.hint };
  const extra: Record<string, { title: string; hint: string }> = {
    '/baza-znaniy': { title: 'База знаний', hint: 'Термины лидогенерации простыми словами' },
    '/o-kompanii': { title: 'О SpinLid', hint: 'Кто мы и откуда данные' },
  };
  return extra[href] ? { href, ...extra[href] } : null;
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function formatRuDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
