import './globals.css';
import { AppShell } from '@/components/AppShell';
import { ClientOnly } from '@/components/ClientOnly';

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
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ClientOnly fallback={<LoadingFallback />}>
          <AppShell>{children}</AppShell>
        </ClientOnly>
      </body>
    </html>
  );
}
