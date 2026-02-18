import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { ClientOnly } from '@/components/ClientOnly';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <span className="text-gray-500">Загрузка...</span>
  </div>
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ClientOnly fallback={<LoadingFallback />}>
          <AppShell>{children}</AppShell>
        </ClientOnly>
      </body>
    </html>
  );
}
