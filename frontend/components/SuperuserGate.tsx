'use client';

/**
 * Гвард служебных страниц старого интерфейса (UX-аудит 16.09, P3):
 * /dashboard, /leads/dashboard, /monitor, /runs — только суперюзеру.
 * Обычного пользователя отправляем в кабинет поиска.
 *
 * Кэш положительного флага — sessionStorage 'is_superuser' (семантика как в
 * lib/useIsSuperuser): пока ответ /auth/me не пришёл, показываем загрузку —
 * суперюзера не редиректим преждевременно.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

type GateState = 'loading' | 'allowed' | 'denied';

export function SuperuserGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('loading');
  const router = useRouter();

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem('is_superuser') === 'true') {
        setState('allowed');
        return;
      }
    } catch {
      /* sessionStorage недоступен — спрашиваем API */
    }
    let cancelled = false;
    fetch('/api/v1/auth/me', { cache: 'no-store' })
      .then(async (res) => (res.ok ? res.json() : Promise.reject(new Error('unauthorized'))))
      .then((me: { is_superuser?: boolean } | null) => {
        if (cancelled) return;
        if (me?.is_superuser) {
          try {
            window.sessionStorage.setItem('is_superuser', 'true');
          } catch {
            /* no-op */
          }
          setState('allowed');
        } else {
          setState('denied');
        }
      })
      .catch(() => {
        // 401/сеть: middleware этих путей сам отводит анонима на логин,
        // сюда попадаем только с протухшим кэшем — ведём в кабинет.
        if (!cancelled) setState('denied');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state === 'denied') router.replace('/app/leads');
  }, [state, router]);

  if (state === 'loading') {
    return <div className="py-16 text-center text-sm text-ui-text-muted">Проверяю доступ…</div>;
  }
  if (state === 'denied') return null;
  return <>{children}</>;
}
