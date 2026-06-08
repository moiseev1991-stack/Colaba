import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope, Unbounded } from 'next/font/google';
import { AppShell } from '@/components/AppShell';
import { CookieBanner } from '@/components/CookieBanner';

export const viewport: Viewport = {
  themeColor: '#2dd4bf',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://spinlid.ru'),
  manifest: '/manifest.json',
  title: {
    default: 'SpinLid — лиды из 2GIS и Яндекс.Карт с диагнозом болей клиентов',
    template: '%s | SpinLid',
  },
  description:
    'Соберём компании из 2GIS и Яндекс.Карт по нише и городу, вытащим контакты и через AI выделим боли клиентов из отзывов. Сразу пригодится для холодной рассылки КП.',
  applicationName: 'SpinLid',
  openGraph: {
    type: 'website',
    siteName: 'SpinLid',
    locale: 'ru_RU',
    url: 'https://spinlid.ru/',
    title: 'SpinLid — лиды из 2GIS и Яндекс.Карт с диагнозом болей клиентов',
    description:
      'Соберём компании из 2GIS и Яндекс.Карт, вытащим контакты и через AI выделим боли клиентов из отзывов.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SpinLid — лиды с диагнозом болей клиентов',
    description:
      'Сбор компаний из 2GIS и Яндекс.Карт, контакты и AI-анализ отзывов.',
  },
  robots: { index: true, follow: true },
};

// §1.2 ТЗ редизайна 2026-06-03: подключаем шрифты через next/font.
// Unbounded — display-шрифт для заголовков (характер, кириллица).
// Manrope — body-шрифт (отличная читаемость на UI).
// Оба отдаются на сборке next-build, no runtime CDN — устойчиво в РФ.
const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});
const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${unbounded.variable} ${manrope.variable}`}>
      <body suppressHydrationWarning style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}>
        <AppShell>{children}</AppShell>
        <CookieBanner />
      </body>
    </html>
  );
}
