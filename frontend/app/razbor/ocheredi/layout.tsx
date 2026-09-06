import type { Metadata } from 'next';

// Изолированный лендинг группы B (очереди/ожидание). Свои title/description/og;
// icons и metadataBase наследуются от родительского /razbor/layout.
// noindex НЕ ставим (индексируется), но в sitemap не добавлена.
export const metadata: Metadata = {
  title: { absolute: 'Клиенты уходят, не дождавшись — бесплатный разбор' },
  description:
    'Разберу по отзывам вашей компании, где клиенты устают ждать и уходят, и покажу, как это закрыть. Бесплатно, за 10 минут, без обязательств.',
  applicationName: 'Разбор потерь клиентов',
  alternates: { canonical: 'https://spinlid.ru/razbor/ocheredi' },
  openGraph: {
    type: 'website',
    title: 'Клиенты уходят, не дождавшись — бесплатный разбор',
    description:
      'Смотрю отзывы вашей компании и показываю, где клиенты устают ждать и уходят. 10 минут, бесплатно, без обязательств.',
    url: 'https://spinlid.ru/razbor/ocheredi',
    siteName: 'Разбор потерь клиентов',
    locale: 'ru_RU',
    images: [{ url: '/razbor/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Клиенты уходят, не дождавшись — бесплатный разбор',
    description:
      'Смотрю отзывы вашей компании и показываю, где клиенты устают ждать и уходят. 10 минут, бесплатно, без обязательств.',
    images: ['/razbor/og.png'],
  },
  robots: { index: true, follow: true },
};

export default function RazborOcherediLayout({ children }: { children: React.ReactNode }) {
  return children;
}
