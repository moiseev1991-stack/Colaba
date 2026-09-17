'use client';

/**
 * OnboardingFlow — 4-шаговый онбординг новой жизни (v2, 17.09).
 *
 * Шаги:
 *   1 «Кто вы» → ProfessionStep (профессия → дефолтные фильтры и шаблон КП)
 *   2 «Ниша и город» → NicheCityStep (CityCombobox + примеры ниш)
 *   3 «Как это работает» → HowItWorksStep (что соберём, сколько ждать,
 *     что получится — осознанный запуск вместо внезапного редиректа)
 *   4 «Запуск» → ProgressStep (createMapSearch → редирект на живую выдачу)
 *
 * После регистрации пользователь попадает сюда автоматически
 * (auth/register). Вернуться можно в любой момент: баннер на /app/leads
 * для юзеров без поисков.
 *
 * Стиль: токены Premium (DESIGN.md) — ui-*, CardV2, Button.
 */

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ProfessionStep, type ProfessionChoice } from '@/components/onboarding/ProfessionStep';
import { NicheCityStep } from '@/components/onboarding/NicheCityStep';
import { HowItWorksStep } from '@/components/onboarding/HowItWorksStep';
import { ProgressStep } from '@/components/onboarding/ProgressStep';
import { cn } from '@/lib/utils';
import {
  getStoredLastCity,
  getStoredLastNiche,
  recordOnboardingEvent,
  setStoredKpTemplateKey,
  setStoredLastCity,
  setStoredLastNiche,
  setStoredProfession,
} from '@/lib/onboarding-storage';
import { createMapSearch, type MapSearchCreate } from '@/src/services/api/maps';

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: 'Кто вы',
  2: 'Ниша и город',
  3: 'Как это работает',
  4: 'Запуск',
};

export function OnboardingFlow() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [profession, setProfession] = useState<ProfessionChoice | null>(null);

  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // На монт — фиксируем старт для аналитики и подтягиваем последний
  // поиск как defaults (юзер вернулся в онбординг повторно).
  useEffect(() => {
    recordOnboardingEvent('onboarding_started');
    const lastNiche = getStoredLastNiche();
    const lastCity = getStoredLastCity();
    if (lastNiche) setNiche(lastNiche);
    if (lastCity) setCity(lastCity);
  }, []);

  function handleProfessionPick(choice: ProfessionChoice, tplKey: string | null) {
    setProfession(choice);
    // Сохраняем сразу: даже если вкладку закроют, на /app/leads чип
    // активируется, а KpModal получит правильный шаблон по умолчанию.
    setStoredProfession(choice === 'other' ? null : choice);
    setStoredKpTemplateKey(tplKey);
    recordOnboardingEvent('profession_selected');
    setStep(2);
  }

  function handleNicheCitySubmit(n: string, c: string) {
    setNiche(n);
    setCity(c);
    setStoredLastNiche(n);
    setStoredLastCity(c);
    recordOnboardingEvent('niche_city_submitted');
    setStep(3);
    recordOnboardingEvent('how_it_works_viewed');
  }

  /** Шаг 3 → 4: осознанный запуск (кнопку нажали на шаге 3). */
  async function handleLaunch() {
    setError(null);
    setStep(4);
    setSubmitting(true);
    recordOnboardingEvent('first_search_launched');

    try {
      const payload: MapSearchCreate = { niche, city };
      const search = await createMapSearch(payload);
      recordOnboardingEvent('first_search_created');
      // Редирект: MapsSearchPanel прочитает map_search_id и покажет
      // живую ленту (счётчик «Уже найдено N» растёт в реальном времени).
      router.push(`/app/leads?map_search_id=${search.id}`);
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail ||
        e?.message ||
        'Не удалось запустить поиск. Проверьте соединение и попробуйте ещё раз.';
      setError(typeof detail === 'string' ? detail : 'Ошибка создания поиска');
      setSubmitting(false);
    }
  }

  function handleBack() {
    setError(null);
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
    // С шага 4 назад нельзя: поиск мог уже создаться.
  }

  const showBack = step === 2 || step === 3;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:py-12">
      {/* Прогресс-шкала: 4 шага, выполненные — с галочкой */}
      <ol className="mb-8 flex items-center gap-2" aria-label="Шаги обзора">
        {([1, 2, 3, 4] as Step[]).map((n, i) => {
          const active = step === n;
          const done = step > n;
          return (
            <li key={n} className="flex min-w-0 flex-1 items-center gap-2">
              <div
                aria-hidden
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done
                    ? 'bg-ui-accent text-ui-accent-contrast'
                    : active
                      ? 'bg-ui-accent text-ui-accent-contrast ring-4 ring-ui-accent/20'
                      : 'bg-ui-surface-2 text-ui-text-muted',
                )}
              >
                {done ? <CheckIcon /> : n}
              </div>
              <span
                className={cn(
                  'truncate text-small font-medium',
                  active || done ? 'text-ui-text' : 'text-ui-text-muted',
                )}
              >
                {STEP_LABELS[n]}
              </span>
              {i < 3 && (
                <div
                  aria-hidden
                  className={cn('mx-1 h-px flex-1', done ? 'bg-ui-accent/40' : 'bg-ui-border')}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Контент шага */}
      <div className="rounded-panel border border-ui-border bg-ui-surface p-5 shadow-raised sm:p-7">
        {step === 1 && <ProfessionStep selected={profession} onSelect={handleProfessionPick} />}
        {step === 2 && (
          <NicheCityStep initialNiche={niche} initialCity={city} onSubmit={handleNicheCitySubmit} />
        )}
        {step === 3 && (
          <HowItWorksStep
            niche={niche}
            city={city}
            onLaunch={handleLaunch}
            submitting={submitting}
          />
        )}
        {step === 4 && (
          <ProgressStep
            niche={niche}
            city={city}
            error={error}
            onRetry={
              error
                ? () => {
                    setStep(3);
                    setError(null);
                  }
                : undefined
            }
          />
        )}
      </div>

      {/* «Назад» — на шагах 2-3 */}
      {showBack && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="mt-3"
          iconLeft={<ChevronLeft className="h-4 w-4" />}
        >
          Назад
        </Button>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
