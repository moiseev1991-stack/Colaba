import Link from 'next/link';

import { PublicFooter } from '@/components/public/PublicFooter';
import { PublicHeader } from '@/components/public/PublicHeader';
import { SEO_LIGHT_VARS } from '@/components/seo-landing/SeoLandingShell';
import {
  KIND_LABEL,
  SECTION_META,
  SITE_ORIGIN,
  articlePath,
  articlesIn,
  formatRuDate,
  type ArticleKind,
  type ArticleSection,
} from '@/lib/content';

const KIND_ORDER: ArticleKind[] = ['research', 'question', 'comparison', 'guide'];
const KIND_GROUP: Record<ArticleKind, string> = {
  research: 'Исследования',
  question: 'Ответы на вопросы',
  comparison: 'Сравнения',
  guide: 'Инструкции и шаблоны',
};

/** Список статей раздела (/issledovaniya, /stati) + разметка ItemList для поисковиков. */
export function SectionHub({ section, intro }: { section: ArticleSection; intro: string }) {
  const meta = SECTION_META[section];
  const items = articlesIn(section);
  const groups = KIND_ORDER.map((k) => ({
    kind: k,
    items: items.filter((a) => a.kind === k),
  })).filter((g) => g.items.length > 0);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: meta.h1,
    itemListElement: items.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_ORIGIN}${articlePath(a)}`,
      name: a.h1,
    })),
  };

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
          </nav>
          <h1 className="mt-4 max-w-[860px] text-[clamp(1.9rem,4.5vw,2.75rem)] font-extrabold leading-tight tracking-tight text-ui-text [text-wrap:balance]">
            {meta.h1}
          </h1>
          <p className="mt-4 max-w-[720px] text-lg leading-relaxed text-ui-text-muted">{intro}</p>

          {groups.map((g) => (
            <section key={g.kind} aria-labelledby={`g-${g.kind}`} className="mt-10">
              {groups.length > 1 && (
                <h2
                  id={`g-${g.kind}`}
                  className="text-xl font-extrabold tracking-tight text-ui-text"
                >
                  {KIND_GROUP[g.kind]}
                </h2>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((a) => (
                  <Link
                    key={a.slug}
                    href={articlePath(a)}
                    className="group flex flex-col rounded-card border border-ui-border bg-ui-surface p-5 transition-colors hover:border-ui-accent/40"
                  >
                    <p className="text-xs font-semibold text-ui-accent">{KIND_LABEL[a.kind]}</p>
                    <h3 className="mt-1.5 text-lg font-bold leading-snug text-ui-text group-hover:text-ui-accent">
                      {a.h1}
                    </h3>
                    <p className="mt-2 flex-1 text-small leading-relaxed text-ui-text-muted">
                      {a.summary[0]}
                    </p>
                    <p className="mt-4 text-xs text-ui-text-muted">
                      {formatRuDate(a.updated)} · {a.readMinutes} мин
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
      <PublicFooter currentHref={meta.path} />
    </div>
  );
}
