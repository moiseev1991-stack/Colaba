'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, tokenStorage } from '@/client';

/** Email текущего пользователя и выход — для меню профиля в шапке и листа «Ещё» на телефоне. */
export function useAccount() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!tokenStorage.getAccessToken()) return;
    let cancelled = false;
    apiClient
      .get('/auth/me')
      .then((res) => {
        if (!cancelled) setEmail(res.data?.email ?? null);
      })
      .catch(() => {
        // Токены здесь не чистим: /auth/me идёт мимо refresh-перехватчика,
        // выход при просроченном токене сделает перехватчик на следующем запросе.
        if (!cancelled) setEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await tokenStorage.clearTokens();
    setEmail(null);
    router.push('/auth/login');
  }, [router]);

  return { email, logout };
}
