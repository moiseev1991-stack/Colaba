import './globals.css';
import dynamic from 'next/dynamic';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

// Load AppShell only on client — avoids hydration mismatch (React #418/#423, HierarchyRequestError)
const AppShellDynamic = dynamic(
  () => import('@/components/AppShell').then((m) => m.AppShell),
  { ssr: false, loading: () => <div className="min-h-screen flex items-center justify-center bg-gray-50"><span className="text-gray-500">Загрузка...</span></div> }
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <div id="__next" className="min-h-screen">
          <AppErrorBoundary>
            <AppShellDynamic>{children}</AppShellDynamic>
          </AppErrorBoundary>
        </div>
        <div id="portal-root" />
      </body>
    </html>
  );
}
