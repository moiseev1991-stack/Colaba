// Список путей, которые считаем «публичной частью» spinlid.ru.
// Источник правды для двух вещей:
//   1. AppShell — НЕ оборачивать эти страницы в AppLayout кабинета.
//   2. YandexMetrika — грузить счётчик ТОЛЬКО на этих страницах.
//
// `/` тут отдельно — главная тоже публичная, но в AppShell она трактуется
// как `isLanding`. Для метрики и SEO-обоих случаев — публичная.
export const PUBLIC_LANDING_PATHS = new Set<string>([
  // Правовые
  '/terms',
  '/policy',
  '/consent',
  '/offer',
  '/data-sources',
  // SEO-лендинги «фичи»
  '/parsing-otzyvov',
  '/parser-2gis',
  '/parser-yandex-maps',
  '/parser-google-maps',
  '/parser-email',
  '/parser-telegram',
  '/baza-klientov',
  '/sbor-kontaktov',
  '/holodnaya-rassylka',
  '/lidogeneraciya',
  '/kupit-bazu-klientov',
  '/baza-dlya-obzvona',
  '/baza-znaniy',
  // SEO-лендинги «для ниши»
  '/klienty-dlya-web-studii',
  '/klienty-dlya-seo',
  '/klienty-dlya-marketing-agentstva',
  // Публичное демо выдачи (read-only, без логина)
  '/demo',
]);

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  return PUBLIC_LANDING_PATHS.has(pathname);
}

// Подмножество — страницы, где есть смысл показывать форму захвата
// лида (бесплатный тест + скидка). На правовых страницах не показываем.
export const LEAD_CAPTURE_PATHS = new Set<string>([
  '/parsing-otzyvov',
  '/parser-2gis',
  '/parser-yandex-maps',
]);
