'use client';

/**
 * OnboardingFlow — корневой компонент 3-шагового онбординга
 * (Эпик B фокус-релиза «КП-конвейер», ТЗ 2026-06-12).
 *
 * State machine:
 *   step=1 → ProfessionStep
 *   step=2 → NicheCityStep
 *   step=3 → ProgressStep (создаётся search, затем редирект на /app/leads)
 *
 * Шкала прогресса вверху, кнопка «Назад» внизу (кроме шага прогресса —
 * там назад нельзя, поиск уже запущен).
 *
 * Demo-режим: на шаге 2 кнопка «Показать на примере» делает router.push
 * на /app/leads?map_search_id={DEMO_ID}. MapsSearchPanel уже умеет
 * принимать этот параметр и грузить готовый поиск.
 *
 * После успешного create-а поиска:
 *  - сохраняем profession + niche + city в localStorage
 *  - редиректим на /app/leads?map_search_id={id}
 *  - на /app/leads ProfessionChipsRow читает localStorage и автоматически
 *    активирует chip; KpModal читает localStorage и выставляет default
 *    template_key.
 */

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ProfessionStep,
  type ProfessionChoice,
} from '@/components/onboarding/ProfessionStep';
import { NicheCityStep } from '@/components/onboarding/NicheCityStep';
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
import {
  createMapSearch,
  type MapSearchCreate,
} from '@/src/services/api/maps';

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: 'Кто вы',
  2: 'Ниша и город',
  3: 'Поиск',
};

export function OnboardingFlow() {
  const router = useRouter();

  // Demo ID — public env, читается на этапе билда (Next.js inlining).
  // Если не задан, кнопка «Показать на примере» скрыта.
  const demoSearchId = process.env.NEXT_PUBLIC_DEMO_SEARCH_ID;
  const demoAvailable = Boolean(demoSearchId && /^\d+$/.test(demoSearchId));

  const [step, setStep] = useState<Step>(1);
  const [profession, setProfession] = useState<ProfessionChoice | null>(null);

  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // На монт — фиксируем старт онбординга для аналитики и подтягиваем
  // последний поиск как defaults на шаге 2 (юзер вернулся в онбординг
  // через закладку).
  useEffect(() => {
    recordOnboardingEvent('onboarding_started');
    const lastNiche = getStoredLastNiche();
    const lastCity = getStoredLastCity();
    if (lastNiche) setNiche(lastNiche);
    if (lastCity) setCity(lastCity);
  }, []);

  function handleProfessionPick(choice: ProfessionChoice, tplKey: string | null) {
    setProfession(choice);
    // Сохраняем сразу в localStorage, чтобы даже если юзер закроет вкладку
    // и вернётся на /app/leads — chip активировался корректно, а KpModal
    // подхватила правильный шаблон по умолчанию.
    setStoredProfession(choice === 'other' ? null : choice);
    setStoredKpTemplateKey(tplKey);
    recordOnboardingEvent('profession_selected');
    setStep(2);
  }

  async function handleNicheCitySubmit(n: string, c: string) {
    setNiche(n);
    setCity(c);
    setStoredLastNiche(n);
    setStoredLastCity(c);
    recordOnboardingEvent('niche_city_submitted');
    setStep(3);
    setError(null);
    setSubmitting(true);

    try {
      const payload: MapSearchCreate = { niche: n, city: c };
      const search = await createMapSearch(payload);
      recordOnboardingEvent('first_search_created');
      // Редирект — MapsSearchPanel прочитает map_search_id и сам подхватит
      // running/completed state. Если 'from_cache' — выдача мгновенная.
      router.push(`/app/leads?map_search_id=${search.id}`);
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail ||
        e?.message ||
        'Не удалось запустить поиск. Проверь соединение и попробуй ещё раз.';
      setError(typeof detail === 'string' ? detail : 'Ошибка создания поиска');
      setSubmitting(false);
    }
  }

  function handleDemo() {
    if (!demoSearchId) return;
    recordOnboardingEvent('demo_opened');
    router.push(`/app/leads?map_search_id=${demoSearchId}`);
  }

  function handleBack() {
    if (step === 2) setStep(1);
    // на шаге 3 backwards не даём — поиск уже создан или создаётся
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      {/* Прогресс-бар */}
      <ol className="mb-8 flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((n, i) => {
          const active = step === n;
          const done = step > n;
          return (
            <li key={n} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold',
                  done
                    ? 'bg-violet-600 text-white'
                    : active
                      ? 'bg-violet-600 text-white ring-4 ring-violet-200 dark:ring-violet-900/50'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
                )}
              >
                {n}
              </div>
              <span
                className={cn(
                  'truncate text-[12.5px] font-medium',
                  active
                    ? 'text-slate-900 dark:text-slate-100'
                    : done
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-500 dark:text-slate-500',
                )}
              >
                {STEP_LABELS[n]}
              </span>
              {i < 2 && (
                <div
                  className={cn(
                    'mx-1 h-px flex-1',
                    done
                      ? 'bg-violet-600'
                      : 'bg-slate-200 dark:bg-slate-700',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Контент шага */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7 dark:border-slate-700 dark:bg-slate-900">
        {step === 1 && (
          <ProfessionStep
            selected={profession}
            onSelect={handleProfessionPick}
          />
        )}
        {step === 2 && (
          <NicheCityStep
            initialNiche={niche}
            initialCity={city}
            onSubmit={handleNicheCitySubmit}
            onDemo={handleDemo}
            demoAvailable={demoAvailable}
            submitting={submitting}
          />
        )}
        {step === 3 && (
          <ProgressStep
            niche={niche}
            city={city}
            error={error}
            onRetry={
              error
                ? () => {
                    setStep(2);
                    setError(null);
                  }
                : undefined
            }
          />
        )}
      </div>

      {/* Кнопка «Назад» — только на шаге 2 (с шага 1 некуда, на шаге 3
          поиск уже создаётся). */}
      {step === 2 && (
        <button
          type="button"
          onClick={handleBack}
          className="mt-3 inline-flex items-center gap-1 text-[13px] text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Назад
        </button>
      )}
    </div>
  );
}
