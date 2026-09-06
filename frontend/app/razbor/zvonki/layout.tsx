import type { Metadata } from 'next';

// Изолированный лендинг группы A (дозвон/запись). Свои title/description/og;
// icons и metadataBase наследуются от родительского /razbor/layout.
// noindex НЕ ставим (индексируется), но в sitemap не добавлена.
export const metadata: Metadata = {
  title: { absolute: 'Клиенты не дозваниваются — бесплатный разбор' },
  description:
    'Разберу по отзывам вашей компании, где теряются звонки и заявки, и покажу, как это закрыть. Бесплатно, за 10 минут, без обязательств.',
  applicationName: 'Разбор потерь клиентов',
  alternates: { canonical: 'https://spinlid.ru/razbor/zvonki' },
  openGraph: {
    type: 'website',
    title: 'Клиенты не дозваниваются — бесплатный разбор',
    description:
      'Смотрю отзывы вашей компании и показываю, где теряются звонки и заявки. 10 минут, бесплатно, без обязательств.',
    url: 'https://spinlid.ru/razbor/zvonki',
    siteName: 'Разбор потерь клиентов',
    locale: 'ru_RU',
    images: [{ url: '/razbor/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Клиенты не дозваниваются — бесплатный разбор',
    description:
      'Смотрю отзывы вашей компании и показываю, где теряются звонки и заявки. 10 минут, бесплатно, без обязательств.',
    images: ['/razbor/og.png'],
  },
  robots: { index: true, follow: true },
};

export default function RazborZvonkiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
