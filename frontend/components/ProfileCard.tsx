'use client';

import { ButtonV2 } from './ui/ButtonV2';
import { CardV2 } from './ui/CardV2';
import { getUser, setUser } from '@/lib/storage';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { User as UserIcon, History, LogOut } from 'lucide-react';
import type { User } from '@/lib/types';

// §4.16 ТЗ редизайна 2026-06-03 (Phase C batch 4): ProfileCard на v2.
// Bg-gray-100/gray-800 → surface-2 для empty, CardV2 для основной карточки.
// h2 в display-шрифте, кнопки ButtonV2 (secondary/danger), иконки lucide.

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
      <div
        className="p-6 rounded-v2-lg"
        style={{ background: 'hsl(var(--surface-2))' }}
      >
        <p style={{ color: 'hsl(var(--muted))' }}>Необходимо войти в систему</p>
        <ButtonV2 onClick={() => router.push('/')} variant="primary" size="md" className="mt-4">
          Войти
        </ButtonV2>
      </div>
    );
  }

  return (
    <CardV2 className="p-6 w-full max-w-2xl">
      <h2
        className="flex items-center gap-2 mb-4 font-display font-semibold tracking-tight text-2xl"
        style={{ color: 'hsl(var(--text))' }}
      >
        <UserIcon className="h-6 w-6 text-brand-600 dark:text-brand-400" />
        Профиль
      </h2>
      <div className="space-y-3 mb-6">
        <div>
          <span className="text-sm" style={{ color: 'hsl(var(--muted))' }}>Email:</span>
          <p style={{ color: 'hsl(var(--text))' }}>{user.email}</p>
        </div>
        <div>
          <span className="text-sm" style={{ color: 'hsl(var(--muted))' }}>Имя:</span>
          <p style={{ color: 'hsl(var(--text))' }}>{user.name}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <ButtonV2 variant="secondary" size="md" onClick={() => router.push('/runs')} iconLeft={<History />}>
          История запусков
        </ButtonV2>
        <ButtonV2 variant="danger" size="md" onClick={handleLogout} iconLeft={<LogOut />}>
          Выйти
        </ButtonV2>
      </div>
    </CardV2>
  );
}
