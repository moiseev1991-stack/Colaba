/**
 * Root layout for Next.js 14 App Router.
 * 
 * Оборачивает все страницы и обеспечивает глобальные стили, мета-теги и провайдеры.
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers/Providers';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'LeadGen Constructor',
  description: 'Модульная платформа для автоматического сбора лидов и анализа данных',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
