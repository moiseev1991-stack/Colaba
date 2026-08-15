import './globals.css';
// Шрифты через @fontsource (npm) вместо next/font/google: build больше не
// ходит в fonts.googleapis.com. Инциденты 13/15.08: сборка фронта в Coolify
// падала на transient-таймаутах Google («NextFontError: Failed to fetch
// Unbounded») — деплой не проходил. @fontsource лежит в node_modules и
// попадает в кэшируемый npm-слой Docker. CSS-переменные --font-display /
// --font-body задаёт globals.css (tailwind читает их оттуда).
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/unbounded/400.css';
import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/600.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/unbounded/800.css';
import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/AppShell';
import { CookieBanner } from '@/components/CookieBanner';
import { YandexMetrika } from '@/components/YandexMetrika';

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
    description: 'Сбор компаний из 2GIS и Яндекс.Карт, контакты и AI-анализ отзывов.',
  },
  robots: { index: true, follow: true },
  // 2026-06-20: верификация владельца сайта для трёх вебмастеров.
  // Next.js рендерит соответствующие <meta name="..."> в <head>.
  // Bing идёт через other.msvalidate.01, потому что у Next.js нет
  // отдельного поля. Удалять эти строки нельзя — иначе подтверждение
  // владения отзовётся, и аналитика/Search Console перестанут собирать данные.
  verification: {
    google: 'Zg_MbVjRv09xuKAhJooGelz95V_FBZFUS0ns99WKkEM',
    yandex: '6121019083c110c9',
    other: {
      'msvalidate.01': 'CE786B4895642D0D8F4F389F90B18CC6',
    },
  },
};

// §1.2 ТЗ редизайна 2026-06-03: шрифты Unbounded (display) + Manrope (body).
// С 2026-08-15 — через @fontsource (см. импорты выше), переменные в globals.css.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}
      >
        <AppShell>{children}</AppShell>
        <CookieBanner />
        <YandexMetrika />
      </body>
    </html>
  );
}
