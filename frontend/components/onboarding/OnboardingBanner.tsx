'use client';

/**
 * Баннер онбординга на /app/leads для пользователей без единого поиска
 * (UX-аудит 16.09, P0-3: новые юзеры попадали в кабинет без подсказок).
 * Показывается один раз до закрытия (localStorage) и только когда история
 * поисков пуста. Ведёт на /app/onboarding — 3-шаговый обзор (OnboardingFlow).
 */

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { listMyMapSearches } from '@/src/services/api/maps';

const DISMISS_KEY = 'spinlid_onboarding_banner_dismissed';

export function OnboardingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(DISMISS_KEY) === '1') return;

    let cancelled = false;
    listMyMapSearches(1, 0)
      .then((searches) => {
        if (!cancelled && searches.length === 0) setVisible(true);
      })
      .catch(() => {
        /* история недоступна (например, 401 при логауте) — баннер не показываем */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-3 rounded-v2-lg border p-4"
      style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
    >
      <Sparkles
        className="mt-0.5 h-5 w-5 shrink-0"
        style={{ color: 'hsl(var(--accent))' }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: 'hsl(var(--text))' }}>
          Первый раз здесь? Пройдите короткий обзор — 1 минута
        </p>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted))' }}>
          Покажем, как найти компании по жалобам их клиентов и подготовить первое письмо.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href="/app/onboarding"
          className="rounded-v2-sm px-3 py-1.5 text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: 'hsl(var(--accent))' }}
        >
          Пройти обзор
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Скрыть подсказку"
          className="flex h-9 w-9 items-center justify-center rounded-v2-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
