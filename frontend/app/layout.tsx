import './globals.css';
import dynamic from 'next/dynamic';

const ClientRoot = dynamic(() => import('@/components/ClientRoot').then(m => m.ClientRoot), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0a0a0a',
      color: '#888',
      fontFamily: 'system-ui, sans-serif'
    }}>
      Загрузка...
    </div>
  ),
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}
