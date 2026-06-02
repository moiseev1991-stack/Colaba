import './globals.css';
import { Manrope, Unbounded } from 'next/font/google';
import { AppShell } from '@/components/AppShell';

// §1.2 ТЗ редизайна 2026-06-03: подключаем шрифты через next/font.
// Unbounded — display-шрифт для заголовков (характер, кириллица).
// Manrope — body-шрифт (отличная читаемость на UI).
// Оба отдаются на сборке next-build, no runtime CDN — устойчиво в РФ.
const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});
const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${unbounded.variable} ${manrope.variable}`}>
      <body suppressHydrationWarning style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
