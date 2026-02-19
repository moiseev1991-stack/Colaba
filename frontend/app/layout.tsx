import './globals.css';
import { ClientHydrationFix } from '@/components/ClientHydrationFix';
import { AppShell } from '@/components/AppShell';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AppErrorBoundary>
          <ClientHydrationFix>
            <AppShell>{children}</AppShell>
          </ClientHydrationFix>
        </AppErrorBoundary>
      </body>
    </html>
  );
}
