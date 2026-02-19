'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  ChevronDown,
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

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Главная', icon: Home, match: 'exact' },
  { href: '/runs', label: 'История', icon: History, authOnly: true, match: 'startsWith' },
  { href: '/monitor', label: 'Request Monitor', icon: Activity, authOnly: true, match: 'exact' },
  { href: '/payment', label: 'Оплата', icon: CreditCard, authOnly: true, match: 'exact' },
  { href: '/settings', label: 'Конфигурация', icon: Settings, authOnly: true, match: 'exact' },
];

const integrationsNavItems: NavItem[] = [
  { href: '/settings/providers', label: 'Провайдеры', icon: Search, authOnly: true, match: 'exact' },
  { href: '/settings/ai-assistants', label: 'AI-ассистенты', icon: Bot, authOnly: true, match: 'exact' },
  { href: '/settings/captcha', label: 'Обход капчи', icon: Shield, authOnly: true, match: 'exact' },
];

const managementNavItems: NavItem[] = [
  { href: '/settings/blacklist', label: 'Blacklist', icon: Ban, authOnly: true, match: 'exact' },
  { href: '/organizations', label: 'Организации', icon: Building2, superuserOnly: true, match: 'startsWith' },
];

function isNavActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.match === 'startsWith') return pathname === item.href || pathname.startsWith(item.href + '/');
  return pathname === item.href;
}

const focusRingClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-focus-ring focus-visible:ring-offset-2 rounded-lg transition-all duration-200 ease-out';
const activeNavClass =
  `text-nav-active-text font-semibold bg-nav-active-bg border-b-2 border-nav-active-indicator ${focusRingClass}`;
const inactiveNavClass =
  `text-nav-text font-medium border-b-2 border-transparent hover:bg-nav-hover-bg hover:text-nav-text-hover ${focusRingClass}`;

export function TopBar() {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePosition, setMorePosition] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const router = useRouter();
  const pathname = usePathname();

  const updateMorePosition = useCallback(() => {
    if (moreButtonRef.current && typeof document !== 'undefined') {
      const rect = moreButtonRef.current.getBoundingClientRect();
      const minWidth = 200;
      let left = rect.left;
      let width = Math.max(minWidth, 220);
      if (left + width > window.innerWidth - 8) width = Math.min(width, window.innerWidth - left - 8);
      if (left < 8) left = 8;
      setMorePosition({ top: rect.bottom + 4, left, width });
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setThemeState(getTheme());
      checkAuth();
    }
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    updateMorePosition();
    const handleResize = () => updateMorePosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', updateMorePosition, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', updateMorePosition, true);
    };
  }, [moreOpen, updateMorePosition]);

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
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (moreButtonRef.current && !moreButtonRef.current.contains(target)) {
        const portalRoot = document.getElementById('more-dropdown-portal');
        if (portalRoot && !portalRoot.contains(target)) setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

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

  const filterByAuth = (items: NavItem[]) =>
    items.filter((item) => {
      if (item.superuserOnly && !isSuperuser) return false;
      return true;
    });

  const visibleMain = filterByAuth(mainNavItems);
  const visibleIntegrations = filterByAuth(integrationsNavItems);
  const visibleManagement = filterByAuth(managementNavItems);
  const hasMoreItems = visibleIntegrations.length > 0 || visibleManagement.length > 0;

  const navLinkClass = (item: NavItem) => {
    const active = isNavActive(pathname, item);
    return `flex items-center gap-1.5 h-9 px-3 py-2 text-sm leading-5 whitespace-nowrap rounded-lg ${
      active ? activeNavClass : inactiveNavClass
    }`;
  };

  const dropdownItemClass = (item: NavItem) => {
    const active = isNavActive(pathname, item);
    return `flex items-center gap-2 h-9 px-3 text-sm leading-5 whitespace-nowrap overflow-hidden text-ellipsis transition-colors duration-200 ease-out w-full text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-focus-ring focus-visible:ring-offset-2 mx-1 ${
      active ? 'text-nav-active-text font-semibold bg-nav-active-bg' : 'text-nav-text hover:bg-nav-hover-bg hover:text-nav-text-hover'
    }`;
  };

  const moreDropdownContent = moreOpen && (
    <div
      id="more-dropdown-portal"
      className="fixed min-w-[200px] max-w-[280px] rounded-[10px] border border-nav-border bg-surface shadow-lg py-2 z-[9999] dark:shadow-xl dark:shadow-black/20"
      style={{
        top: morePosition.top,
        left: morePosition.left,
        minWidth: 200,
        width: Math.min(morePosition.width, 280),
      }}
      role="menu"
    >
      {visibleIntegrations.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMoreOpen(false)}
            className={dropdownItemClass(item)}
            role="menuitem"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
      {visibleIntegrations.length > 0 && visibleManagement.length > 0 && (
        <div className="border-t border-nav-border my-2 mx-2" />
      )}
      {visibleManagement.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMoreOpen(false)}
            className={dropdownItemClass(item)}
            role="menuitem"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <header className="w-full h-14 flex items-center border-b border-nav-border bg-nav-bg shrink-0">
      <div className="container mx-auto px-6 flex items-center justify-between gap-4 h-full">
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 mr-2 text-gray-900 dark:text-white hover:opacity-90 transition-opacity"
          aria-label="Главная"
        >
          <div className="w-8 h-8 rounded-[10px] bg-saas-primary-weak flex items-center justify-center shrink-0" aria-hidden>
            <span className="text-saas-primary font-bold text-sm">S</span>
          </div>
          <span className="font-semibold text-base">SpinLid</span>
        </Link>
        <nav
          className="flex items-center gap-3 overflow-x-auto flex-1 min-w-0 py-1 -mx-1 px-1"
          style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
        >
          {visibleMain.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href + item.label} href={item.href} className={navLinkClass(item)}>
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {hasMoreItems && (
            <div className="relative shrink-0">
              <button
                ref={moreButtonRef}
                onClick={() => setMoreOpen(!moreOpen)}
                className={`flex items-center gap-1.5 h-9 px-3 py-2 text-sm leading-5 whitespace-nowrap rounded-lg ${
                  moreOpen ? activeNavClass : inactiveNavClass
                }`}
                aria-haspopup="true"
                aria-expanded={moreOpen}
                aria-controls="more-dropdown-portal"
              >
                <span>Ещё</span>
                <ChevronDown className="h-4 w-4" />
              </button>
              {mounted && moreOpen && createPortal(moreDropdownContent, document.getElementById('portal-root') ?? document.body)}
            </div>
          )}
        </nav>

        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 min-w-0" aria-label="Тема">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(!menuOpen)}
              className="h-8 w-8 min-w-0"
              aria-label="Профиль"
            >
              <UserIcon className="h-4 w-4" />
            </Button>

            {menuOpen && (
              <div className="absolute right-0 mt-1.5 min-w-[200px] rounded-[10px] border border-nav-border bg-surface shadow-lg py-2 z-[9999] dark:shadow-xl dark:shadow-black/20">
                {userEmail && (
                  <div className="px-4 py-2 text-xs text-nav-text truncate border-b border-nav-border opacity-75">
                    {userEmail}
                  </div>
                )}
                {isAuthenticated ? (
                  <>
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 h-9 px-4 text-sm text-nav-text hover:bg-nav-hover-bg hover:text-nav-text-hover transition-colors duration-200 ease-out w-full text-left mx-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-focus-ring focus-visible:ring-offset-2"
                    >
                      <UserIcon className="h-4 w-4" />
                      Профиль
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 h-9 px-4 text-sm text-nav-text hover:bg-nav-hover-bg hover:text-nav-text-hover w-full text-left transition-colors duration-200 ease-out mx-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-focus-ring focus-visible:ring-offset-2"
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
                    className="flex items-center gap-2 h-9 px-4 text-sm text-nav-text hover:bg-nav-hover-bg hover:text-nav-text-hover w-full text-left transition-colors duration-200 ease-out mx-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-focus-ring focus-visible:ring-offset-2"
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
    </header>
  );
}
