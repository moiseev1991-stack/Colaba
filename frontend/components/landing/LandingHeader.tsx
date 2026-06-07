'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SEO_NAV_LINKS } from './seoNavLinks';

const ANCHORS = [
  { id: 'diagnosis', label: 'Диагноз' },
  { id: 'pricing', label: 'Тарифы' },
  { id: 'examples', label: 'Примеры' },
  { id: 'faq', label: 'FAQ' },
] as const;

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const observersRef = useRef<IntersectionObserver[]>([]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    observersRef.current.forEach((obs) => obs.disconnect());
    observersRef.current = [];

    const sectionIds = ANCHORS.map((a) => a.id);
    sectionIds.forEach((id) => {
      const section = document.getElementById(id);
      if (!section) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveSection(id);
            }
          });
        },
        { threshold: 0.35, rootMargin: '-20% 0px -40% 0px' }
      );
      observer.observe(section);
      observersRef.current.push(observer);
    });

    return () => {
      observersRef.current.forEach((obs) => obs.disconnect());
    };
  }, []);

  const scrollTo = (id: string, focusEmail?: boolean) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    if (focusEmail) setTimeout(() => document.getElementById('register-email')?.focus(), 600);
    setMobileOpen(false);
  };

  return (
    <nav className={`l-nav${scrolled ? ' scrolled' : ''}`} id="l-nav">
      <div className="l-nav__inner">
        <a href="#top" className="l-nav__logo" onClick={(e) => { e.preventDefault(); scrollTo('top'); }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '32px', 
              height: '32px', 
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #a855f7 100%)',
              boxShadow: '0 0 12px rgba(139, 92, 246, 0.4)'
            }}
          >
            <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
              <path d="M16,6 C21.5,6 26,10.5 26,16 C26,18.5 25,20.8 23.2,22.3 C21.5,23.8 19.2,24.5 17,24 C14.5,23.4 12.5,21.5 12,19 C11.7,17.5 12,16 13,15.2 C14,15.5 15,16 15,17 C15,18 15.5,19 16.5,19.5 C17.5,20 19,19.8 20,19 C21,18.2 21.5,17 21.5,16 C21.5,13.2 19,11 16,11 C13,11 10.5,13.2 10.5,16 C10.5,17.5 11,19 12,20 C13,21 14.5,21.5 16,21.5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
          </span>
          <span>SpinLid</span>
        </a>

        <ul className={`l-nav__links${mobileOpen ? ' open' : ''}`}>
          {/* Dropdown «Возможности» — ведёт на 6 SEO-страниц. На мобиле
              раскрывается inline (hover недоступен), на десктопе по hover. */}
          <li
            style={{ position: 'relative' }}
            onMouseEnter={() => setSolutionsOpen(true)}
            onMouseLeave={() => setSolutionsOpen(false)}
          >
            <button
              type="button"
              onClick={() => setSolutionsOpen((v) => !v)}
              aria-expanded={solutionsOpen}
            >
              Возможности ▾
            </button>
            {solutionsOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  minWidth: '320px',
                  padding: '8px',
                  background: 'rgba(15, 23, 42, 0.97)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                  display: 'grid',
                  gap: '2px',
                  zIndex: 50,
                }}
              >
                {SEO_NAV_LINKS.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    role="menuitem"
                    onClick={() => {
                      setSolutionsOpen(false);
                      setMobileOpen(false);
                    }}
                    style={{
                      display: 'block',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      color: 'rgba(255,255,255,0.92)',
                      textDecoration: 'none',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(45,212,191,0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>
                      {s.label}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.6)',
                        marginTop: '2px',
                        lineHeight: 1.4,
                      }}
                    >
                      {s.hint}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </li>
          {ANCHORS.map(({ id, label }) => (
            <li key={id}>
              <button
                className={activeSection === id ? 'active' : ''}
                onClick={() => scrollTo(id)}
              >
                {label}
              </button>
            </li>
          ))}
          <li>
            <Link href="/auth/login" className="l-nav__login">Войти</Link>
          </li>
          <li>
            <button className="l-nav__cta" onClick={() => scrollTo('register', true)}>
              Создать аккаунт
            </button>
          </li>
        </ul>

        <button
          className={`l-nav__burger${mobileOpen ? ' open' : ''}`}
          id="l-burger"
          aria-label="Меню"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </nav>
  );
}
