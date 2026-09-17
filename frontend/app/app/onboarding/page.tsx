/**
 * /app/onboarding — точка входа в 4-шаговый обзор продукта (v2, 17.09):
 * кто вы → ниша и город → как это работает → запуск первого поиска.
 *
 * Маршрутизация: после регистрации пользователь попадает сюда автоматически
 * (auth/register); вернуться можно через баннер на /app/leads (показывается
 * пользователям без поисков) или прямой ссылкой.
 *
 * Вся логика — в OnboardingFlow.tsx (client component).
 */

import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  return (
    <div className="min-h-[100dvh] bg-ui-bg">
      <OnboardingFlow />
    </div>
  );
}
