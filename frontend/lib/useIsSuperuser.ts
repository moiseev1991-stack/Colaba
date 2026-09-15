'use client';

import { useEffect, useState } from 'react';

// Параллельные вызовы хука (сайдбар, бургер-меню, форма поиска) делят один
// запрос к /auth/me; после ответа кэш сбрасывается.
let inflight: Promise<boolean> | null = null;

function fetchIsSuperuser(): Promise<boolean> {
  if (!inflight) {
    inflight = fetch('/api/v1/auth/me', { cache: 'no-store' })
      .then(async (res) => (res.ok ? Boolean((await res.json())?.is_superuser) : false))
      .catch(() => false)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Флаг is_superuser текущего пользователя.
 *
 * В sessionStorage кэшируем ТОЛЬКО положительный флаг — иначе после случайной
 * 401 (медленный логин, гонка) служебные разделы пропадали бы до закрытия вкладки.
 */
export function useIsSuperuser(): boolean {
  const [isSuperuser, setIsSuperuser] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('is_superuser') === 'true') {
        setIsSuperuser(true);
        return;
      }
    } catch {
      /* sessionStorage недоступен — спрашиваем API */
    }
    let cancelled = false;
    fetchIsSuperuser().then((flag) => {
      if (cancelled) return;
      setIsSuperuser(flag);
      if (flag) {
        try {
          sessionStorage.setItem('is_superuser', 'true');
        } catch {
          /* no-op */
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return isSuperuser;
}
