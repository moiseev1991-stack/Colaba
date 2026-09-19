import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';

import { PublicFooter } from '@/components/public/PublicFooter';
import { PublicHeader } from '@/components/public/PublicHeader';
import { SEO_LIGHT_VARS } from '@/components/seo-landing/SeoLandingShell';
import {
  KIND_LABEL,
  SECTION_META,
  SITE_ORIGIN,
  articlePath,
  formatRuDate,
  resolveRelated,
  type Article,
  type ArticleBlock,
} from '@/lib/content';
import { cn } from '@/lib/utils';

/**
 * Страница статьи (19.09): текст — главное, одна колонка ~720px и оглавление сбоку на десктопе.
 * Сверху блок «Кратко» — прямой ответ на вопрос статьи (его цитируют поисковики и нейросети).
 * Разметка schema.org: Article (+ Dataset у исследований), FAQPage, BreadcrumbList.
 */
export function ArticleShell({ article }: { article: Article }) {
  const section = SECTION_META[article.section];
  const path = articlePath(article);
  const toc = article.blocks.filter(
    (b): b is Extract<ArticleBlock, { type: 'h2' }> => b.type === 'h2',
  );
  const related = article.related
    .map(resolveRelated)
    .filter((r): r is NonNullable<ReturnType<typeof resolveRelated>> => r !== null);

  return (
    <div
      className="flex min-h-screen flex-col bg-ui-bg text-ui-text"
      data-theme="light"
      style={
        {
          ...SEO_LIGHT_VARS,
          fontFamily: 'var(--font-body), system-ui, sans-serif',
        } as React.CSSProperties
      }
    >
      <PublicHeader variant="subpage" forceSolid />

      <main className="flex-1 pt-[66px]">
        <div className="mx-auto w-full max-w-[1232px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
          <nav aria-label="Хлебные крошки" className="text-small text-ui-text-muted">
            <Link href="/" className="hover:text-ui-text">
              Главная
            </Link>
            <span className="mx-1.5">·</span>
            <Link href={section.path} className="hover:text-ui-text">
              {article.section === 'issledovaniya' ? 'Исследования' : 'Статьи'}
            </Link>
          </nav>

          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,720px)_1fr]">
            <article className="min-w-0">
              <p className="text-small font-semibold text-ui-accent">{KIND_LABEL[article.kind]}</p>
              <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold leading-tight tracking-tight text-ui-text [text-wrap:balance]">
                {article.h1}
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-ui-text-muted">{article.lead}</p>
              <p className="mt-4 text-small text-ui-text-muted">
                Команда SpinLid · обновлено{' '}
                <time dateTime={article.updated}>{formatRuDate(article.updated)}</time> ·{' '}
                {article.readMinutes} мин чтения
              </p>

              <section
                aria-labelledby="kratko"
                className="mt-8 rounded-card border border-ui-accent/20 bg-ui-accent/[.05] p-5 sm:p-6"
              >
                <h2 id="kratko" className="text-base font-bold text-ui-text">
                  Кратко
                </h2>
                <ul className="mt-3 space-y-2">
                  {article.summary.map((s) => (
                    <li key={s} className="flex gap-2.5 text-base leading-relaxed text-ui-text">
                      <span
                        aria-hidden
                        className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-ui-accent"
                      />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="mt-8 space-y-5">
                {article.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </div>

              {article.faq.length > 0 && (
                <section aria-labelledby="faq" className="mt-12">
                  <h2 id="faq" className="text-2xl font-extrabold tracking-tight text-ui-text">
                    Частые вопросы
                  </h2>
                  <div className="mt-4 divide-y divide-ui-border border-y border-ui-border">
                    {article.faq.map((f) => (
                      <div key={f.q} className="py-4">
                        <h3 className="text-base font-bold text-ui-text">{f.q}</h3>
                        <p className="mt-1.5 text-base leading-relaxed text-ui-text-muted">{f.a}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="mt-12 rounded-panel bg-ui-text p-6 text-ui-surface sm:p-8">
                <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                  Найдите компании с такими жалобами в своём городе
                </h2>
                <p className="mt-2 max-w-[56ch] text-base leading-relaxed opacity-80">
                  SpinLid соберёт компании ниши с карт, выделит жалобы клиентов из отзывов и
                  подготовит черновик письма под каждую. Бесплатная бета.
                </p>
                <Link
                  href="/auth/register"
                  className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-ui-accent px-6 text-base font-bold text-white transition-colors hover:bg-ui-accent/90"
                >
                  Попробовать бесплатно <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </section>

              {related.length > 0 && (
                <section aria-labelledby="related" className="mt-12">
                  <h2 id="related" className="text-xl font-extrabold tracking-tight text-ui-text">
                    Читайте также
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {related.map((r) => (
                      <Link
                        key={r.href}
                        href={r.href}
                        className="group rounded-card border border-ui-border bg-ui-surface p-4 transition-colors hover:border-ui-accent/40"
                      >
                        <p className="text-xs font-semibold text-ui-accent">{r.hint}</p>
                        <p className="mt-1 text-base font-bold leading-snug text-ui-text group-hover:text-ui-accent">
                          {r.title}
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </article>

            {toc.length > 1 && (
              <aside className="hidden lg:block">
                <nav aria-label="Содержание" className="sticky top-24">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ui-text-muted">
                    Содержание
                  </p>
                  <ol className="mt-3 space-y-2 border-l border-ui-border pl-4">
                    {toc.map((h) => (
                      <li key={h.id}>
                        <a
                          href={`#${h.id}`}
                          className="text-small leading-snug text-ui-text-muted hover:text-ui-accent"
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                    {article.faq.length > 0 && (
                      <li>
                        <a
                          href="#faq"
                          className="text-small text-ui-text-muted hover:text-ui-accent"
                        >
                          Частые вопросы
                        </a>
                      </li>
                    )}
                  </ol>
                </nav>
              </aside>
            )}
          </div>
        </div>
      </main>

      <JsonLd data={articleJsonLd(article, path)} />
      {article.faq.length > 0 && <JsonLd data={faqJsonLd(article)} />}
      <JsonLd data={breadcrumbJsonLd(article, path)} />
      {article.dataset && <JsonLd data={datasetJsonLd(article, path)} />}

      <PublicFooter currentHref={path} />
    </div>
  );
}

function Block({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2
          id={block.id}
          className="scroll-mt-24 pt-6 text-2xl font-extrabold tracking-tight text-ui-text"
        >
          {block.text}
        </h2>
      );
    case 'h3':
      return <h3 className="pt-2 text-lg font-bold text-ui-text">{block.text}</h3>;
    case 'p':
      return <p className="text-base leading-[1.75] text-ui-text/90">{block.text}</p>;
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          className={cn(
            'space-y-2 pl-6 text-base leading-relaxed text-ui-text/90',
            block.ordered ? 'list-decimal' : 'list-disc marker:text-ui-accent',
          )}
        >
          {block.items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <figure className="overflow-x-auto rounded-card border border-ui-border">
          <table className="w-full min-w-[520px] border-collapse text-left text-small">
            <thead className="bg-ui-surface-2">
              <tr>
                {block.head.map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-semibold text-ui-text">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="border-t border-ui-border align-top">
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className={cn('px-3 py-2.5 text-ui-text/90', j === 0 && 'font-medium')}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption && (
            <figcaption className="border-t border-ui-border bg-ui-surface-2/50 px-3 py-2 text-xs text-ui-text-muted">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case 'bars': {
      const max = Math.max(1, ...block.items.map((i) => i.value));
      return (
        <figure className="rounded-card border border-ui-border bg-ui-surface p-4 sm:p-5">
          <ul className="space-y-3">
            {block.items.map((it) => (
              <li key={it.label}>
                <div className="flex items-baseline justify-between gap-3 text-small">
                  <span className="text-ui-text">{it.label}</span>
                  <span className="shrink-0 font-bold tabular-nums text-ui-text">
                    {String(it.value).replace('.', ',')}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-ui-surface-2">
                  <div
                    className="h-2 rounded-full bg-ui-accent"
                    style={{ width: `${(it.value / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {block.caption && (
            <figcaption className="mt-3 text-xs text-ui-text-muted">{block.caption}</figcaption>
          )}
        </figure>
      );
    }
    case 'stats':
      return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {block.items.map((s) => (
            <div key={s.label} className="rounded-card bg-ui-surface-2 px-4 py-3">
              <dt className="text-xs text-ui-text-muted">{s.label}</dt>
              <dd className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight text-ui-text">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'quote':
      return (
        <figure className="rounded-card bg-ui-surface-2 p-4 sm:p-5">
          <Quote className="h-4 w-4 text-ui-accent" aria-hidden />
          <blockquote className="mt-2 text-base italic leading-relaxed text-ui-text">
            «{block.text}»
          </blockquote>
          {block.note && (
            <figcaption className="mt-2 text-xs text-ui-text-muted">
              Отзыв клиента · {block.note}
            </figcaption>
          )}
        </figure>
      );
    case 'callout':
      return (
        <aside className="rounded-card border border-ui-accent/25 bg-ui-accent/[.05] p-4 sm:p-5">
          {block.title && <p className="font-bold text-ui-text">{block.title}</p>}
          <p className={cn('text-base leading-relaxed text-ui-text/90', block.title && 'mt-1')}>
            {block.text}
          </p>
        </aside>
      );
    default:
      return null;
  }
}

function JsonLd({ data }: { data: object }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

const ORG = {
  '@type': 'Organization',
  name: 'SpinLid',
  url: SITE_ORIGIN,
  logo: `${SITE_ORIGIN}/icon.svg`,
};

function articleJsonLd(a: Article, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': a.kind === 'guide' ? 'HowTo' : 'Article',
    ...(a.kind === 'guide'
      ? {
          name: a.h1,
          step: a.blocks
            .filter((b): b is Extract<ArticleBlock, { type: 'h2' }> => b.type === 'h2')
            .map((b, i) => ({ '@type': 'HowToStep', position: i + 1, name: b.text })),
        }
      : { headline: a.h1 }),
    description: a.description,
    inLanguage: 'ru-RU',
    datePublished: a.published,
    dateModified: a.updated,
    author: ORG,
    publisher: ORG,
    mainEntityOfPage: `${SITE_ORIGIN}${path}`,
    url: `${SITE_ORIGIN}${path}`,
    abstract: a.summary.join(' '),
  };
}

function faqJsonLd(a: Article) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: a.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function breadcrumbJsonLd(a: Article, path: string) {
  const section = SECTION_META[a.section];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_ORIGIN}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: a.section === 'issledovaniya' ? 'Исследования' : 'Статьи',
        item: `${SITE_ORIGIN}${section.path}`,
      },
      { '@type': 'ListItem', position: 3, name: a.h1, item: `${SITE_ORIGIN}${path}` },
    ],
  };
}

function datasetJsonLd(a: Article, path: string) {
  const d = a.dataset!;
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: d.name,
    description: d.description,
    url: `${SITE_ORIGIN}${path}`,
    creator: ORG,
    temporalCoverage: d.period,
    spatialCoverage: { '@type': 'Place', name: 'Россия' },
    variableMeasured: 'Главная жалоба клиентов в отзывах (категория, доля компаний)',
    isAccessibleForFree: true,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    measurementTechnique: 'AI-группировка негативных отзывов по темам жалоб',
  };
}
