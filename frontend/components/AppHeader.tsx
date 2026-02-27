'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Moon, Sun, User as UserIcon, LogOut, CreditCard, Settings, Activity } from 'lucide-react';
import { getTheme, setTheme } from '@/lib/storage';
import { tokenStorage } from '@/client';
import { apiClient } from '@/client';
import type { Theme } from '@/lib/types';
import type { ModuleId } from '@/lib/ModuleContext';

const MODULES: { id: ModuleId; label: string }[] = [
  { id: 'seo', label: 'SEO' },
  { id: 'leads', label: 'Поиск лидов' },
  { id: 'tenders', label: 'Госзакупки' },
];

function getModuleFromPath(pathname: string): ModuleId | null {
  if (pathname === '/dashboard') return null;
  if (pathname.startsWith('/seo')) return 'seo';
  if (pathname.startsWith('/leads')) return 'leads';
  if (pathname.startsWith('/tenders')) return 'tenders';
  if (pathname.startsWith('/app/seo') || pathname.startsWith('/runs') || pathname.startsWith('/settings')) return 'seo';
  if (pathname.startsWith('/app/leads')) return 'leads';
  if (pathname.startsWith('/app/gos') || pathname.startsWith('/app/tenders')) return 'tenders';
  return null;
}

export function AppHeader() {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const currentModule = pathname ? getModuleFromPath(pathname) : null;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setThemeState(getTheme());
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
        await tokenStorage.clearTokens();
      }
    } else setUserEmail(null);
  };

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  const handleLogout = async () => {
    await tokenStorage.clearTokens();
    setUserEmail(null);
    setMenuOpen(false);
    router.push('/auth/login');
  };

  const goToModule = (id: ModuleId) => {
    const routes: Record<ModuleId, string> = {
      seo: '/runs',
      leads: '/app/leads/history',
      tenders: '/app/gos/history',
    };
    router.push(routes[id]);
  };

  const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-focus-ring))] focus-visible:ring-offset-2 rounded-[8px]';
  const navItemClass = (active: boolean) =>
    `flex items-center gap-2 h-9 px-3 rounded-[8px] text-[14px] font-medium transition-colors ${focusClass} ${
      active ? 'bg-[hsl(var(--nav-active-bg))] font-semibold' : 'hover:bg-[hsl(var(--nav-hover-bg))]'
    }`;

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between px-6 border-b overflow-visible"
      style={{ backgroundColor: 'hsl(var(--nav-bg))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="SpinLid">
          <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[hsl(var(--accent-weak))]" aria-hidden>
            <span className="text-[14px] font-bold" style={{ color: 'hsl(var(--accent))' }}>S</span>
          </div>
          <span className="font-semibold text-[15px]" style={{ color: 'hsl(var(--text))' }}>SpinLid</span>
        </Link>
      </div>

      <nav className="flex items-center gap-2" role="tablist">
        {MODULES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={currentModule === m.id}
            onClick={() => goToModule(m.id)}
            className={navItemClass(currentModule === m.id)}
            style={{
              color: currentModule === m.id ? 'hsl(var(--nav-active-text))' : 'hsl(var(--nav-text))',
            }}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2 shrink-0">
        <Link href="/monitor" className={navItemClass(pathname === '/monitor')} style={{ color: 'hsl(var(--nav-text))' }}>
          <Activity className="h-4 w-4" /> Request Monitor
        </Link>
        <Link href="/payment" className={navItemClass(pathname === '/payment')} style={{ color: 'hsl(var(--nav-text))' }}>
          <CreditCard className="h-4 w-4" /> Оплата
        </Link>
        <Link href="/settings" className={navItemClass(pathname?.startsWith('/settings'))} style={{ color: 'hsl(var(--nav-text))' }}>
          <Settings className="h-4 w-4" /> Конфигурация
        </Link>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
          className={`inline-flex h-8 w-8 min-w-0 items-center justify-center rounded-[8px] hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
          aria-label="Тема"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" style={{ color: 'hsl(var(--nav-text))' }} /> : <Moon className="h-4 w-4" style={{ color: 'hsl(var(--nav-text))' }} />}
        </button>

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
