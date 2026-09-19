import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter } from '@/components/public/PublicFooter';
import { PublicHeader } from '@/components/public/PublicHeader';
import { SEO_LIGHT_VARS } from '@/components/seo-landing/SeoLandingShell';
import { SITE_ORIGIN } from '@/lib/content';
import { SUPPORT_EMAIL } from '@/lib/site';

// «О компании» (19.09): кто мы, откуда данные и как с ними работаем — поисковики и нейросети
// учитывают, есть ли у источника понятный автор и методология.
export const metadata: Metadata = {
  title: 'О SpinLid — кто мы и откуда данные',
  description:
    'SpinLid — сервис поиска B2B-клиентов по жалобам в отзывах. Как мы собираем данные с 2GIS, Яндекс.Карт и Google Maps, как считаем исследования и чего не делаем.',
  alternates: { canonical: `${SITE_ORIGIN}/o-kompanii` },
};

const SECTIONS: { id: string; title: string; paragraphs: string[]; list?: string[] }[] = [
  {
    id: 'chto-delaem',
    title: 'Что мы делаем',
    paragraphs: [
      'SpinLid помогает веб-студиям, маркетинговым и SEO-агентствам и B2B-продавцам находить клиентов и писать им по делу. Сервис собирает компании нужной ниши и города с 2GIS, Яндекс.Карт и Google Maps, читает отзывы их клиентов и выделяет повторяющиеся жалобы — «боли» — с числом упоминаний и цитатой.',
      'Под боль конкретной компании SpinLid готовит черновик письма или коммерческого предложения. Отправляет его пользователь сам — со своей почты или из CRM: мы не делаем массовых рассылок от имени клиентов.',
    ],
  },
  {
    id: 'dannye',
    title: 'Откуда данные',
    paragraphs: [
      'Мы работаем с общедоступной информацией о компаниях: карточки организаций и отзывы на картах, открытые сведения из ЕГРЮЛ, контакты, которые компании сами публикуют на своих сайтах.',
    ],
    list: [
      'Отзывы анализирует AI: группирует негативные отзывы компании в темы жалоб и выбирает цитату-пример.',
      'В исследованиях публикуем только сводные цифры — без названий компаний, контактов и имён. Цитаты обезличены.',
      'Методология описана в каждом исследовании: выборка, период сбора, как считаются доли, ограничения.',
    ],
  },
  {
    id: 'issledovaniya',
    title: 'Исследования',
    paragraphs: [
      'На собранных данных мы выпускаем исследования «На что жалуются клиенты» по нишам и городам России. Их можно цитировать со ссылкой на SpinLid и страницу исследования.',
    ],
  },
  {
    id: 'kontakty',
    title: 'Контакты',
    paragraphs: [
      `Вопросы по сервису, данным и исследованиям — ${SUPPORT_EMAIL}. Правила обработки данных — в политике конфиденциальности.`,
    ],
  },
];

export default function AboutPage() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SpinLid',
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/icon.svg`,
    email: SUPPORT_EMAIL,
    description:
      'Сервис поиска B2B-клиентов: компании с карт, жалобы клиентов из отзывов и черновики писем под боль каждой компании.',
    areaServed: 'RU',
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
        <article className="mx-auto w-full max-w-[768px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
          <nav aria-label="Хлебные крошки" className="text-small text-ui-text-muted">
            <Link href="/" className="hover:text-ui-text">
              Главная
            </Link>
          </nav>
          <h1 className="mt-4 text-[clamp(1.9rem,4.5vw,2.75rem)] font-extrabold leading-tight tracking-tight">
            О SpinLid
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ui-text-muted">
            Мы делаем так, чтобы первое письмо компании было не «предлагаем услуги», а про её
            конкретную проблему — ту, о которой пишут её собственные клиенты.
          </p>
          {SECTIONS.map((s) => (
            <section key={s.id} aria-labelledby={s.id} className="mt-10">
              <h2 id={s.id} className="text-2xl font-extrabold tracking-tight">
                {s.title}
              </h2>
              {s.paragraphs.map((p) => (
                <p key={p} className="mt-3 text-base leading-[1.75] text-ui-text/90">
                  {p}
                </p>
              ))}
              {s.list && (
                <ul className="mt-3 list-disc space-y-2 pl-6 text-base leading-relaxed text-ui-text/90 marker:text-ui-accent">
                  {s.list.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/issledovaniya"
              className="inline-flex h-11 items-center rounded-full bg-ui-accent px-5 font-bold text-white hover:bg-ui-accent/90"
            >
              Исследования
            </Link>
            <Link
              href="/stati"
              className="inline-flex h-11 items-center rounded-full border border-ui-border px-5 font-semibold hover:border-ui-text/40"
            >
              Статьи
            </Link>
            <Link
              href="/policy"
              className="inline-flex h-11 items-center rounded-full border border-ui-border px-5 font-semibold hover:border-ui-text/40"
            >
              Политика конфиденциальности
            </Link>
          </div>
        </article>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }}
      />
      <PublicFooter currentHref="/o-kompanii" />
    </div>
  );
}
