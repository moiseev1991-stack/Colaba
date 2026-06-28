'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { User as UserIcon, LogOut, CreditCard, Settings, Activity, Sparkles, Moon, Sun } from 'lucide-react';
import { tokenStorage } from '@/client';
import { apiClient } from '@/client';
import { getTheme, setTheme } from '@/lib/storage';
import type { Theme } from '@/lib/types';
import { BrandMark } from '@/components/BrandMark';
import { MobileNav } from '@/components/MobileNav';

export function AppHeader() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>('dark');
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setThemeState(getTheme());
    }
  }, []);

  useEffect(() => {
    const onThemeChange = () => setThemeState(getTheme());
    window.addEventListener('themechange', onThemeChange);
    return () => window.removeEventListener('themechange', onThemeChange);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
    window.dispatchEvent(new Event('themechange'));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      checkAuth();
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  const checkAuth = async () => {
    const token = tokenStorage.getAccessToken();
    if (token) {
      try {
        const res = await apiClient.get('/auth/me');
        setUserEmail(res.data.email ?? null);
      } catch {
        setUserEmail(null);
        // Do NOT clear tokens here. The /auth/me endpoint bypasses the refresh
        // interceptor, so clearing tokens prematurely would break navigation —
        // the interceptor will handle refresh/logout on subsequent API calls.
      }
    } else setUserEmail(null);
  };

  const handleLogout = async () => {
    await tokenStorage.clearTokens();
    setUserEmail(null);
    setMenuOpen(false);
    router.push('/auth/login');
  };

  const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-focus-ring))] focus-visible:ring-offset-2 rounded-[8px]';

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between px-3 md:px-6 border-b-0 md:border-b overflow-visible relative z-20"
      style={{
        backgroundColor: 'hsl(var(--nav-bg) / 0.95)',
        borderColor: 'hsl(var(--border))',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Left: бургер (моб.) + Logo — единая BrandMark (emerald→cyan, белая спираль) */}
      <div className="flex items-center gap-2 shrink-0">
        <MobileNav />
        <Link href="/dashboard" className="flex items-center gap-2 group" aria-label="SpinLid">
          <span className="inline-flex items-center justify-center transition-all group-hover:scale-105 shrink-0">
            <BrandMark
              size={32}
              gradient="linear-gradient(135deg, #10b981 0%, #06b6d4 100%)"
              spiralColor="white"
              glow="var(--shadow-v2-sm)"
            />
          </span>
          <span className="font-display font-semibold text-[15px] tracking-tight" style={{ color: 'hsl(var(--text))' }}>SpinLid</span>
        </Link>
      </div>

      {/* Center: empty — module switcher lives in the sidebar now */}
      <div className="flex-1" />

      {/* Right: actions */}
      <div className="flex items-center gap-1 md:gap-2 shrink-0">
        {/* «Купить подписку» — главный фиолетовый акцент (§1.1 ТЗ: МАКСИМУМ
            одна accent-кнопка на экран). Бренд CTA — это обычный primary
            бренд-градиент в карточках, здесь — accent чтобы выделить покупку. */}
        <Link
          href="/#pricing"
          className="inline-flex min-h-9 items-center gap-2 rounded-v2-sm bg-accent-gradient px-3 md:px-4 text-[13px] md:text-[14px] font-semibold text-white shadow-v2-sm transition-all hover:shadow-v2-hover hover:scale-[1.02] active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Купить подписку</span>
        </Link>

        {/* Theme toggle — sun/moon, icon only */}
        <button
          type="button"
          onClick={toggleTheme}
          className={`inline-flex h-8 w-8 min-w-0 items-center justify-center rounded-[8px] transition-colors hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
          aria-label={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" style={{ color: 'hsl(var(--accent))' }} aria-hidden />
          ) : (
            <Moon className="h-4 w-4" style={{ color: 'hsl(var(--accent))' }} aria-hidden />
          )}
        </button>

        {/* Request Monitor — desktop only */}
        <Link
          href="/monitor"
          className={`hidden md:flex items-center gap-2 h-9 px-3 rounded-[8px] text-[14px] font-medium transition-colors hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass} ${pathname === '/monitor' ? 'bg-[hsl(var(--nav-active-bg))] font-semibold' : ''}`}
          style={{ color: pathname === '/monitor' ? 'hsl(var(--nav-active-text))' : 'hsl(var(--nav-text))' }}
        >
          <Activity className="h-4 w-4" /> Request Monitor
        </Link>

        {/* User profile dropdown */}
        <div className="relative overflow-visible" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className={`inline-flex h-8 w-8 min-w-0 items-center justify-center rounded-[8px] hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
            aria-label="Профиль"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <UserIcon className="h-4 w-4" style={{ color: 'hsl(var(--nav-text))' }} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 min-w-[200px] rounded-[8px] border py-2 shadow-xl z-[10000]"
              style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
            >
              {userEmail && (
                <div className="px-4 py-2 text-[12px] truncate border-b" style={{ color: 'hsl(var(--muted))', borderColor: 'hsl(var(--border))' }}>
                  {userEmail}
                </div>
              )}
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 h-9 px-4 text-[14px] w-full text-left transition-colors hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
                style={{ color: 'hsl(var(--text))' }}
              >
                <UserIcon className="h-4 w-4" /> Профиль
              </Link>
              <Link
                href="/payment"
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 h-9 px-4 text-[14px] w-full text-left transition-colors hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
                style={{ color: 'hsl(var(--text))' }}
              >
                <CreditCard className="h-4 w-4" /> Оплата
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 h-9 px-4 text-[14px] w-full text-left transition-colors hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
                style={{ color: 'hsl(var(--text))' }}
              >
                <Settings className="h-4 w-4" /> Конфигурация
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className={`flex items-center gap-2 h-9 px-4 text-[14px] w-full text-left transition-colors hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
                style={{ color: 'hsl(var(--text))' }}
              >
                <LogOut className="h-4 w-4" /> Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

