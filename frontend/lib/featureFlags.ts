/**
 * Флаги функций, которые зависят от готовности бэкенда.
 *
 * NEXT_PUBLIC_* подставляются при сборке: чтобы включить флаг, задайте
 * переменную при `next build` (в Docker — build-arg) и пересоберите фронтенд.
 */

/** Вход через Google / Яндекс / VK / Telegram. Выключен, пока OAuth не починен на бэкенде. */
export const OAUTH_ENABLED = process.env.NEXT_PUBLIC_OAUTH_ENABLED === 'true';
