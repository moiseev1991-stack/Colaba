'use client';

import { useEffect } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { TopBar } from '@/components/TopBar';
import { HeroHeader } from '@/components/HeroHeader';
import { getTheme, setTheme } from '@/lib/storage';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Initialize theme
    const theme = getTheme();
    setTheme(theme);
  }, []);

  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
          <TopBar />
          <HeroHeader />
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
