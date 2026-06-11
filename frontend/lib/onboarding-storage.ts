/**
 * Лёгкая обёртка над localStorage для онбординга (Эпик B ТЗ 2026-06-12).
 *
 * Что храним:
 *  - выбранная профессия (для авто-активации chip'а + дефолт template_key в KpModal)
 *  - последняя выбранная ниша/город (для повторного захода без онбординга)
 *  - timestamp ключевых событий (`onboarding_started`, `first_search_created`,
 *    `first_kp_generated`) — простая аналитика «время до первого КП».
 *
 * SSR-safe: на сервере window отсутствует, все get-функции возвращают null,
 * set — no-op.
 */

import type { ProfessionPresetKey } from '@/components/maps/professionPresets';

const KEY_PROFESSION = 'colaba.onboarding.profession';
const KEY_KP_TEMPLATE = 'colaba.kp.default_template_key';
const KEY_LAST_NICHE = 'colaba.onboarding.last_niche';
const KEY_LAST_CITY = 'colaba.onboarding.last_city';

const KEY_EVENT_PREFIX = 'colaba.onboarding.event.';

export type OnboardingEvent =
  | 'onboarding_started'
  | 'profession_selected'
  | 'niche_city_submitted'
  | 'first_search_created'
  | 'demo_opened'
  | 'first_kp_generated';

function safeWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  return window;
}

function safeGet(key: string): string | null {
  const w = safeWindow();
  if (!w) return null;
  try {
    return w.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  const w = safeWindow();
  if (!w) return;
  try {
    w.localStorage.setItem(key, value);
  } catch {
    /* quota exceeded — игнорим, онбординг не критичен */
  }
}

export function getStoredProfession(): ProfessionPresetKey | null {
  const v = safeGet(KEY_PROFESSION);
  if (v === 'for_webstudio' || v === 'for_seo' || v === 'for_marketing') return v;
  return null;
}

export function setStoredProfession(key: ProfessionPresetKey | null): void {
  if (key == null) {
    safeSet(KEY_PROFESSION, '');
    return;
  }
  safeSet(KEY_PROFESSION, key);
}

export function getStoredKpTemplateKey(): string | null {
  const v = safeGet(KEY_KP_TEMPLATE);
  return v && v.length > 0 ? v : null;
}

export function setStoredKpTemplateKey(key: string | null): void {
  safeSet(KEY_KP_TEMPLATE, key ?? '');
}

export function getStoredLastNiche(): string | null {
  return safeGet(KEY_LAST_NICHE);
}

export function setStoredLastNiche(niche: string): void {
  safeSet(KEY_LAST_NICHE, niche);
}

export function getStoredLastCity(): string | null {
  return safeGet(KEY_LAST_CITY);
}

export function setStoredLastCity(city: string): void {
  safeSet(KEY_LAST_CITY, city);
}

/** Простая аналитика времени в онбординге. Пишем ISO-timestamp один раз
 *  на событие; если событие уже было — не перезаписываем (хотим знать
 *  именно ПЕРВЫЙ раз). Юзер увидит цифры в DevTools → Application →
 *  localStorage, фронт их пока никуда не отправляет — это для пилотных
 *  пользователей и личной аналитики Димы. */
export function recordOnboardingEvent(event: OnboardingEvent): void {
  const key = KEY_EVENT_PREFIX + event;
  if (safeGet(key)) return;
  safeSet(key, new Date().toISOString());
}

export function getOnboardingEventAt(event: OnboardingEvent): string | null {
  return safeGet(KEY_EVENT_PREFIX + event);
}
