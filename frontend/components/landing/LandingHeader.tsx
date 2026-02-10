'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const ANCHORS = [
  { id: 'features', label: 'Возможности' },
  { id: 'audience', label: 'Для кого' },
  { id: 'how', label: 'Как работает' },
  { id: 'examples', label: 'Примеры' },
  { id: 'pricing', label: 'Тарифы' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contacts', label: 'Контакты' },
] as const;

export function LandingHeader() {
  const [activeId, setActiveId] = useState<string>('');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActiveId(e.target.id);
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    ANCHORS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-50 flex h-14 items-center justify-between px-4 md:px-6 transition-all duration-200 ${
        scrolled ? 'backdrop-blur-md bg-white/90 border-b border-[var(--landing-border)] shadow-sm' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--landing-radius)] bg-[var(--landing-accent-soft)]">
          <span className="text-sm font-bold" style={{ color: 'var(--landing-accent)' }}>S</span>
        </div>
        <span className="font-semibold text-[15px]" style={{ color: 'var(--landing-text)' }}>SpinLid</span>
      </div>

      <nav className="hidden md:flex items-center gap-1">
        {ANCHORS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => scrollTo(id)}
            className={`px-3 py-2 rounded-[var(--landing-radius)] text-sm font-medium transition-colors ${
              activeId === id
                ? 'bg-[var(--landing-accent-soft)] text-[var(--landing-accent)]'
                : 'text-[var(--landing-muted)] hover:text-[var(--landing-text)] hover:bg-[var(--landing-accent-soft)]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="hidden md:flex items-center gap-2">
        <Link
          href="/auth/login"
          className="px-4 py-2 rounded-[var(--landing-radius)] text-sm font-medium transition-colors hover:bg-[var(--landing-accent-soft)]"
          style={{ color: 'var(--landing-text)' }}
        >
          Войти
        </Link>
        <button
          onClick={() => scrollTo('register')}
          className="px-4 py-2 rounded-[var(--landing-radius)] text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2"
          style={{ backgroundColor: 'var(--landing-accent)' }}
        >
          Регистрация
        </button>
      </div>

      <button
        className="md:hidden p-2 rounded-[var(--landing-radius)] hover:bg-[var(--landing-accent-soft)]"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Меню"
      >
        {mobileOpen ? <X className="h-5 w-5" style={{ color: 'var(--landing-text)' }} /> : <Menu className="h-5 w-5" style={{ color: 'var(--landing-text)' }} />}
      </button>

      {mobileOpen && (
        <div className="absolute top-14 left-0 right-0 bg-white border-b border-[var(--landing-border)] shadow-lg md:hidden">
          <div className="flex flex-col p-4 gap-1">
            {ANCHORS.map(({ id, label }) => (
              <button key={id} onClick={() => scrollTo(id)} className="px-4 py-3 text-left text-sm font-medium rounded-[var(--landing-radius)] hover:bg-[var(--landing-accent-soft)]" style={{ color: activeId === id ? 'var(--landing-accent)' : 'var(--landing-text)' }}>
                {label}
              </button>
            ))}
            <hr className="my-2 border-[var(--landing-border)]" />
            <Link href="/auth/login" className="px-4 py-3 text-sm font-medium rounded-[var(--landing-radius)] hover:bg-[var(--landing-accent-soft)]" style={{ color: 'var(--landing-text)' }}>
              Войти
            </Link>
            <button onClick={() => scrollTo('register')} className="px-4 py-3 text-sm font-medium rounded-[var(--landing-radius)] text-white text-left" style={{ backgroundColor: 'var(--landing-accent)' }}>
              Регистрация
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
