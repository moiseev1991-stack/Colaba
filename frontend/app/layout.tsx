import dynamic from 'next/dynamic';
import './globals.css';

const AppShell = dynamic(
  () => import('@/components/AppShell').then((m) => ({ default: m.AppShell })),
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
