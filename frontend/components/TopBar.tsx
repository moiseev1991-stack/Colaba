'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Moon,
  Sun,
  User as UserIcon,
  LogIn,
  LogOut,
  History,
  Ban,
  Home,
  CreditCard,
  Settings,
  Building2,
  Search,
  Bot,
  Shield,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { getTheme, setTheme } from '@/lib/storage';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { tokenStorage } from '@/client';
import { apiClient } from '@/client';
import type { Theme } from '@/lib/types';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  authOnly?: boolean;
  superuserOnly?: boolean;
  match?: 'exact' | 'startsWith';
};

const topNavItems: NavItem[] = [
  { href: '/', label: 'Главная', icon: Home, match: 'exact' },
  { href: '/runs', label: 'История', icon: History, authOnly: true, match: 'startsWith' },
  { href: '/monitor', label: 'Request Monitor', icon: Activity, authOnly: true, match: 'exact' },
  { href: '/payment', label: 'Оплата', icon: CreditCard, authOnly: true, match: 'exact' },
  { href: '/settings', label: 'Конфигурация', icon: Settings, authOnly: true, match: 'exact' },
  { href: '/settings/blacklist', label: 'Blacklist', icon: Ban, authOnly: true, match: 'exact' },
  { href: '/settings/providers', label: 'Провайдеры', icon: Search, authOnly: true, match: 'exact' },
  { href: '/settings/ai-assistants', label: 'AI-ассистенты', icon: Bot, authOnly: true, match: 'exact' },
  { href: '/settings/captcha', label: 'Обход капчи', icon: Shield, authOnly: true, match: 'exact' },
  { href: '/organizations', label: 'Организации', icon: Building2, superuserOnly: true, match: 'startsWith' },
];

function isNavActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.match === 'startsWith') return pathname === item.href || pathname.startsWith(item.href + '/');
  return pathname === item.href;
}

export function TopBar() {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setThemeState(getTheme());
      checkAuth();
    }
  }, []);

  const checkAuth = async () => {
    const token = tokenStorage.getAccessToken();
    if (token) {
      try {
        const response = await apiClient.get('/auth/me');
        setIsAuthenticated(true);
        setUserEmail(response.data.email ?? null);
        setIsSuperuser(Boolean(response.data.is_superuser));
      } catch {
        setIsAuthenticated(false);
        setUserEmail(null);
        setIsSuperuser(false);
        tokenStorage.clearTokens();
      }
    } else {
      setIsAuthenticated(false);
      setUserEmail(null);
      setIsSuperuser(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  const handleLogout = () => {
    tokenStorage.clearTokens();
    setIsAuthenticated(false);
    setUserEmail(null);
    setMenuOpen(false);
    router.push('/auth/login');
  };

  const visibleTopNav = topNavItems.filter((item) => {
    if (item.superuserOnly && !isSuperuser) return false;
    if (item.authOnly && !isAuthenticated) return false;
    return true;
  });

  const navLinkClass = (item: NavItem) => {
    const active = isNavActive(pathname, item);
    return `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
      active
        ? 'bg-red-600 text-white'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
    }`;
  };

  return (
    <div className="w-full border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-2">
        {/* Horizontal nav — scrollable on mobile */}
        <nav
          className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 py-1 -mx-1 px-1"
          style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
        >
          {visibleTopNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={navLinkClass(item)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right: theme + profile dropdown */}
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8" aria-label="Тема">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(!menuOpen)}
              className="h-8 w-8"
              aria-label="Профиль"
            >
              <UserIcon className="h-4 w-4" />
            </Button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
                {userEmail && (
                  <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 truncate border-b border-gray-200 dark:border-gray-700">
                    {userEmail}
                  </div>
                )}
                {isAuthenticated ? (
                  <>
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <UserIcon className="h-4 w-4" />
                      Профиль
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 w-full text-left transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Выйти
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      router.push('/auth/login');
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 w-full text-left transition-colors"
                  >
                    <LogIn className="h-4 w-4" />
                    Войти
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
