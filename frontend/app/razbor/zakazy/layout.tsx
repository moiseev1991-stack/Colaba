import type { Metadata } from 'next';

// Изолированный лендинг группы D1 (статус заказа). Свои title/description/og;
// icons и metadataBase наследуются от родительского /razbor/layout.
// noindex НЕ ставим (индексируется), но в sitemap не добавлена.
export const metadata: Metadata = {
  title: { absolute: '«Где мой заказ?» — бесплатный разбор' },
  description:
    'Разберу по отзывам вашей компании, где уходит время на вопросах о заказах, и покажу, как это закрыть. Бесплатно, за 10 минут, без обязательств.',
  applicationName: 'Разбор потерь клиентов',
  alternates: { canonical: 'https://spinlid.ru/razbor/zakazy' },
  openGraph: {
    type: 'website',
    title: '«Где мой заказ?» — бесплатный разбор',
    description:
      'Смотрю отзывы вашей компании и показываю, где уходит время на вопросах о заказах. 10 минут, бесплатно, без обязательств.',
    url: 'https://spinlid.ru/razbor/zakazy',
    siteName: 'Разбор потерь клиентов',
    locale: 'ru_RU',
    images: [{ url: '/razbor/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '«Где мой заказ?» — бесплатный разбор',
    description:
      'Смотрю отзывы вашей компании и показываю, где уходит время на вопросах о заказах. 10 минут, бесплатно, без обязательств.',
    images: ['/razbor/og.png'],
  },
  robots: { index: true, follow: true },
};

export default function RazborZakazyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
