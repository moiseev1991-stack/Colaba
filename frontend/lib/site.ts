/** Общие данные сайта: бренд, контакты и юридические документы для шапок и подвалов. */

export const SITE_NAME = 'SpinLid';
export const SUPPORT_EMAIL = 'support@spinlid.ru';

export type LegalLink = { href: string; label: string; short: string };

/** Юридические документы. `label` — для подвалов публичных страниц, `short` — для кабинета и мобильного меню. */
export const LEGAL_LINKS: LegalLink[] = [
  { href: '/terms', label: 'Пользовательское соглашение', short: 'Соглашение' },
  { href: '/policy', label: 'Политика конфиденциальности', short: 'Политика' },
  { href: '/consent', label: 'Согласие на обработку ПДн', short: 'Согласие на ПДн' },
  { href: '/offer', label: 'Публичная оферта', short: 'Оферта' },
  { href: '/data-sources', label: 'Открытые источники', short: 'Источники' },
];
