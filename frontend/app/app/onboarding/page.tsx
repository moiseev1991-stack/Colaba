/**
 * /app/onboarding — точка входа в 3-шаговый онбординг
 * (Эпик B фокус-релиза «КП-конвейер», ТЗ 2026-06-12).
 *
 * Стратегия маршрутизации:
 *  - Новый пользователь из рекламы попадает сюда напрямую (с landing'а
 *    или auth callback'а). Пусть это будет явный URL без middleware
 *    redirect-логики — на MVP проще руками линковать.
 *  - В будущем (после Эпика B) /auth/callback может проверять — был ли
 *    у юзера хотя бы один MapSearch, и если нет — редиректить сюда.
 *
 * Вся логика — в OnboardingFlow.tsx (client component).
 */

import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <OnboardingFlow />
    </div>
  );
}
