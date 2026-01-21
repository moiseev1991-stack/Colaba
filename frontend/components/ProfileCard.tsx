'use client';

import { Button } from './ui/button';
import { getUser, setUser } from '@/lib/storage';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { User } from '@/lib/types';

export function ProfileCard() {
  const [user, setUserState] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    setUserState(getUser());
  }, []);

  const handleLogout = () => {
    setUser(null);
    router.push('/');
  };

  if (!user) {
    return (
      <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <p className="text-gray-600 dark:text-gray-400">Необходимо войти в систему</p>
        <Button onClick={() => router.push('/')} className="mt-4">
          Войти
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-lg max-w-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Профиль</h2>
      <div className="space-y-3 mb-6">
        <div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Email:</span>
          <p className="text-gray-900 dark:text-white">{user.email}</p>
        </div>
        <div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Имя:</span>
          <p className="text-gray-900 dark:text-white">{user.name}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="outline" onClick={() => router.push('/runs')}>
          История запусков
        </Button>
        <Button variant="destructive" onClick={handleLogout}>
          Выйти
        </Button>
      </div>
    </div>
  );
}
