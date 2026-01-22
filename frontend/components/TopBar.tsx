'use client';

import { useState, useEffect, useRef } from 'react';
import { Moon, Sun, User as UserIcon, LogIn, History, Ban, Home, CreditCard, Settings, Menu, X } from 'lucide-react';
import { Button } from './ui/button';
import { getTheme, setTheme, getUser, setUser } from '@/lib/storage';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Theme, User } from '@/lib/types';

export function TopBar() {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [user, setUserState] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentTheme = getTheme();
      setThemeState(currentTheme);
      setUserState(getUser());
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const toggleTheme = () => {
    const newTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    setThemeState(newTheme);
  };

  const handleAuth = () => {
    if (user) {
      router.push('/profile');
    } else {
      // Mock Google OAuth - set user
      const mockUser = { email: 'user@example.com', name: 'Username' };
      setUser(mockUser);
      setUserState(mockUser);
      router.push('/profile');
    }
  };

  return (
    <div className="w-full border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-600 rounded"></div>
            <Link href="/" className="text-sm text-gray-700 dark:text-gray-300 hover:text-red-600">
              SpinLid
            </Link>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          
          {/* Dropdown Menu */}
          <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(!menuOpen)}
              className="h-8 w-8"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    pathname === '/'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Home className="h-4 w-4" />
                  Главная
                </Link>
                <Link
                  href="/runs"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    pathname?.startsWith('/runs')
                      ? 'bg-red-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <History className="h-4 w-4" />
                  История
                </Link>
                <Link
                  href="/payment"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    pathname === '/payment'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  Оплата
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    pathname === '/settings'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  Конфигурация
                </Link>
                {user && (
                  <Link
                    href="/settings/blacklist"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      pathname === '/settings/blacklist'
                        ? 'bg-red-600 text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Ban className="h-4 w-4" />
                    Blacklist
                  </Link>
                )}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                <button
                  onClick={() => {
                    handleAuth();
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 w-full text-left transition-colors"
                >
                  {user ? (
                    <>
                      <UserIcon className="h-4 w-4" />
                      Профиль
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Войти
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
