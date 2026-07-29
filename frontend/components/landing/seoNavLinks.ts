/**
 * Список SEO-лендингов — общий источник для навигации:
 * - LandingHeader (dropdown «Возможности»)
 * - SeoLandingShell (header → шапка)
 * - блок «Решения» на главной (после ModulesSection)
 *
 * Слаг и подпись должны совпадать с metadata title и H1 в page.tsx.
 */

export interface SeoNavLink {
  href: string;
  label: string;
  /** Короткая подпись для dropdown/preview-карточки. */
  hint: string;
}

export const SEO_NAV_LINKS: SeoNavLink[] = [
  {
    href: '/parsing-otzyvov',
    label: 'Парсинг и AI-анализ отзывов',
    hint: 'Боли клиентов с цитатами — основа продукта',
  },
  {
    href: '/parser-2gis',
    label: 'Парсер 2GIS',
    hint: 'Компании, контакты и отзывы из 2ГИС',
  },
  {
    href: '/parser-yandex-maps',
    label: 'Парсер Яндекс.Карт',
    hint: 'Альтернативный источник к 2GIS — со склейкой дублей',
  },
  {
    href: '/parser-google-maps',
    label: 'Парсер Google Maps',
    hint: 'Третий источник со склейкой дублей и отзывами Google',
  },
  {
    href: '/parser-email',
    label: 'Парсер email',
    hint: 'Сбор почты компаний с сайтов и карт + проверка на живость',
  },
  {
    href: '/parser-telegram',
    label: 'Парсер Telegram',
    hint: 'Публичные Telegram-контакты компаний как канал касания',
  },
  {
    href: '/lidogeneraciya',
    label: 'Лидогенерация',
    hint: 'Вся воронка — от сбора компаний до тёплого лида',
  },
  {
    href: '/baza-klientov',
    label: 'База клиентов под нишу',
    hint: 'Свежая база с контактами и юр.данными — без устаревших списков',
  },
  {
    href: '/sbor-kontaktov',
    label: 'Сбор контактов компаний',
    hint: 'Email и телефоны с сайтов и карточек 2GIS / Я.Карт',
  },
  {
    href: '/holodnaya-rassylka',
    label: 'Холодная рассылка КП',
    hint: 'От базы до статусов доставки — в одном инструменте',
  },
];
