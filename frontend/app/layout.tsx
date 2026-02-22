import './globals.css';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
