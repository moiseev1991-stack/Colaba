import './globals.css';
import { ClientHydrationFix } from '@/components/ClientHydrationFix';
import { AppShell } from '@/components/AppShell';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">
        <ClientHydrationFix>
          <AppShell>{children}</AppShell>
        </ClientHydrationFix>
      </body>
    </html>
  );
}
