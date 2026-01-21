'use client';

import { useState, useEffect } from 'react';
import { Moon, Sun, User as UserIcon, LogIn, History, Ban, Home } from 'lucide-react';
import { Button } from './ui/button';
import { getTheme, setTheme, getUser, setUser } from '@/lib/storage';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Theme, User } from '@/lib/types';

export function TopBar() {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [user, setUserState] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentTheme = getTheme();
      setThemeState(currentTheme);
      setUserState(getUser());
    }
  }, []);

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
          
          <nav className="flex items-center gap-2 ml-4">
            <Link
              href="/"
              className={`px-3 py-1 rounded text-sm transition-colors ${
                pathname === '/'
                  ? 'bg-red-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              <Home className="h-4 w-4 inline mr-1" />
              Главная
            </Link>
            <Link
              href="/runs"
              className={`px-3 py-1 rounded text-sm transition-colors ${
                pathname?.startsWith('/runs')
                  ? 'bg-red-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              <History className="h-4 w-4 inline mr-1" />
              История
            </Link>
            {user && (
              <Link
                href="/settings/blacklist"
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  pathname === '/settings/blacklist'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
              >
                <Ban className="h-4 w-4 inline mr-1" />
                Blacklist
              </Link>
            )}
          </nav>
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
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAuth}
            className="flex items-center gap-2"
          >
            {user ? (
              <>
                <UserIcon className="h-4 w-4" />
                <span>Профиль</span>
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>Войти</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
