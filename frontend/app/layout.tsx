import './globals.css';
import dynamic from 'next/dynamic';
import { ClientRoot } from '@/components/ClientRoot';

const LoadingPlaceholder = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <span className="text-gray-500 dark:text-gray-400">Загрузка...</span>
  </div>
);

// Production: dynamic + ssr:false to avoid hydration errors. Dev: direct import (works locally)
const ClientRootDynamic = dynamic(
  () => import('@/components/ClientRoot').then((m) => m.ClientRoot),
  { ssr: false, loading: () => <LoadingPlaceholder /> }
);

const isDev = process.env.NODE_ENV === 'development';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {isDev ? <ClientRoot>{children}</ClientRoot> : <ClientRootDynamic>{children}</ClientRootDynamic>}
      </body>
    </html>
  );
}
