import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { AppShell } from '@/components/AppShell';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

const themeScript = `
(function(){var t=localStorage.getItem('spinlid_theme');var dark=t==='dark'?true:t==='light'?false:window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;r.classList.toggle('dark',!!dark);r.setAttribute('data-theme',dark?'dark':'light');})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Script id="theme-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
