import type { Metadata } from 'next';

// Изолированный лендинг оффера «Дмитрий» (Часть 1). Свои метатеги, og и
// favicon — НЕ наследуются от сайта. `title.absolute` обходит шаблон
// «%s | SpinLid» из корневого layout, openGraph/twitter/applicationName/icons
// задаются заново, чтобы на странице и в её мета не было ни слова SpinLid
// и ни одной ссылки на остальной сайт. metadataBase (https://spinlid.ru)
// берётся из корневого layout — og:image резолвится в абсолютный URL.
export const metadata: Metadata = {
  title: { absolute: 'Бесплатный разбор: где ваш бизнес теряет клиентов' },
  description:
    'Разберу по отзывам вашей компании, где теряются клиенты, и покажу, как это закрыть. Бесплатно, за 10 минут, без обязательств.',
  applicationName: 'Разбор потерь клиентов',
  alternates: { canonical: 'https://spinlid.ru/razbor' },
  openGraph: {
    type: 'website',
    title: 'Где ваш бизнес теряет клиентов — бесплатный разбор',
    description:
      'Смотрю отзывы вашей компании и показываю, где уходят клиенты и как это закрыть. 10 минут, бесплатно, без обязательств.',
    url: 'https://spinlid.ru/razbor',
    siteName: 'Разбор потерь клиентов',
    locale: 'ru_RU',
    images: [{ url: '/razbor/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Где ваш бизнес теряет клиентов — бесплатный разбор',
    description:
      'Смотрю отзывы вашей компании и показываю, где уходят клиенты и как это закрыть. 10 минут, бесплатно, без обязательств.',
    images: ['/razbor/og.png'],
  },
  icons: { icon: [{ url: '/razbor/favicon.svg', type: 'image/svg+xml' }] },
  // По ТЗ: noindex НЕ ставим (страница индексируется), но в sitemap не добавлена.
  robots: { index: true, follow: true },
};

export default function RazborLayout({ children }: { children: React.ReactNode }) {
  return children;
}
