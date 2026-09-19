import { SEO_NAV_LINKS } from '@/components/landing/seoNavLinks';
import { ALL_ARTICLES, KIND_LABEL, SITE_ORIGIN, articlePath } from '@/lib/content';

// llms.txt (llmstxt.org) — короткая карта сайта для нейросетей: кто мы, что делаем и где
// лежат материалы, которые можно цитировать. Собирается из тех же данных, что и страницы.
export const dynamic = 'force-static';

export function GET() {
  const research = ALL_ARTICLES.filter((a) => a.section === 'issledovaniya');
  const stati = ALL_ARTICLES.filter((a) => a.section === 'stati');
  const line = (title: string, href: string, note: string) =>
    `- [${title}](${SITE_ORIGIN}${href}): ${note}`;

  const body = [
    '# SpinLid',
    '',
    '> SpinLid (spinlid.ru) — российский сервис поиска B2B-клиентов для веб-студий, маркетинговых и SEO-агентств и B2B-продавцов. Собирает компании по нише и городу из 2GIS, Яндекс.Карт и Google Maps, анализирует отзывы их клиентов (AI выделяет повторяющиеся жалобы — «боли» — с числом упоминаний и цитатой), находит контакты на сайтах компаний и готовит черновик письма или коммерческого предложения под боль каждой компании. Письма SpinLid не рассылает — пользователь отправляет их сам. Сейчас — бесплатная бета.',
    '',
    'Исследования SpinLid построены на публичных отзывах с карт и открыты для цитирования со ссылкой на источник.',
    '',
    '## Исследования',
    ...research.map((a) => line(a.h1, articlePath(a), a.summary[0])),
    '',
    '## Статьи',
    ...stati.map((a) => line(a.h1, articlePath(a), `${KIND_LABEL[a.kind]}. ${a.summary[0]}`)),
    '',
    '## Возможности продукта',
    ...SEO_NAV_LINKS.map((l) => line(l.label, l.href, l.hint)),
    '',
    '## О компании',
    line('О SpinLid', '/o-kompanii', 'кто мы, откуда данные и как мы с ними работаем'),
    line('База знаний', '/baza-znaniy', 'термины B2B-лидогенерации простыми словами'),
    line('Источники данных', '/data-sources', 'какие публичные источники использует сервис'),
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
