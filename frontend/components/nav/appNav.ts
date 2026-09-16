import {
  Ban,
  BarChart3,
  Bookmark,
  CreditCard,
  Database,
  FileText,
  Flame,
  History,
  Inbox,
  LayoutDashboard,
  ListPlus,
  Mail,
  MapPin,
  Search,
  Send,
  Settings,
  Settings2,
  ShieldCheck,
  User,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Навигация кабинета (вид Premium, 16.09): основные разделы — в верхнем меню
 * (на телефоне — в нижних вкладках), остальное — в меню профиля («Ещё»).
 * Боковое меню и переключатель модулей убраны: «Госзакупки» и SEO выключены.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Пункт про отправку писем из SpinLid — пока она выключена, пункт серый с пометкой «скоро» (lib/outreach.ts). */
  requiresSending?: boolean;
};
export type NavSection = { title?: string; items: NavItem[] };

/** Верхнее меню. */
export const PRIMARY_NAV: NavItem[] = [
  { href: '/app/leads', label: 'Поиск', icon: Search },
  { href: '/app/pains', label: 'По боли', icon: Flame },
  { href: '/app/leads/history', label: 'История', icon: History },
  { href: '/app/leads/lists', label: 'Списки', icon: ListPlus },
  { href: '/app/leads/proposals', label: 'Шаблоны КП', icon: FileText },
];

/** Нижние вкладки на телефоне; пятая — «Ещё» (меню профиля). */
export const MOBILE_TABS: NavItem[] = PRIMARY_NAV.slice(0, 4);

const WORK_SECTION: NavSection = {
  title: 'Работа',
  items: [
    { href: '/app/leads/presets', label: 'Мои пресеты', icon: Bookmark },
    { href: '/app/leads/templates', label: 'Шаблоны писем', icon: Mail },
    { href: '/leads/dashboard', label: 'Дашборд', icon: LayoutDashboard },
    { href: '/monitor', label: 'Request Monitor', icon: Activity },
  ],
};

const SETTINGS_SECTION: NavSection = {
  title: 'Настройки',
  items: [
    { href: '/app/settings/profile', label: 'Профиль', icon: User },
    { href: '/app/leads/settings', label: 'Параметры поиска', icon: Settings },
    { href: '/app/leads/blacklist', label: 'Блеклист', icon: Ban },
    { href: '/app/settings/maps-providers', label: 'Провайдеры карт', icon: MapPin },
    { href: '/app/settings/email-providers', label: 'Провайдеры email', icon: Mail, requiresSending: true },
    { href: '/app/settings/channels', label: 'Каналы рассылки', icon: Send, requiresSending: true },
    { href: '/payment', label: 'Оплата', icon: CreditCard },
  ],
};

/** Только суперюзеру: служебные разделы и email-рассылка. */
const ADMIN_SECTION: NavSection = {
  title: 'Админ',
  items: [
    { href: '/app/admin/website-leads', label: 'Заявки с сайта', icon: ShieldCheck },
    { href: '/app/admin/data-inventory', label: 'Data inventory', icon: Database },
    { href: '/app/email/campaigns', label: 'Кампании', icon: Mail, requiresSending: true },
    { href: '/app/email/messages', label: 'Сообщения', icon: Inbox, requiresSending: true },
    { href: '/app/email/stats', label: 'Статистика', icon: BarChart3, requiresSending: true },
    { href: '/app/email/settings', label: 'Настройка рассылки', icon: Settings2, requiresSending: true },
  ],
};

/** Секции меню профиля с учётом роли. */
export function menuSectionsFor(isSuperuser: boolean): NavSection[] {
  return isSuperuser ? [WORK_SECTION, SETTINGS_SECTION, ADMIN_SECTION] : [WORK_SECTION, SETTINGS_SECTION];
}

/** Активный пункт — с самым длинным совпавшим префиксом («История» внутри «Поиска»). */
export function getBestMatch(pathname: string | null, items: NavItem[]): string | null {
  if (!pathname) return null;
  const matches = items
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    .sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

/** Все пункты (для поиска активного): верхнее меню + меню профиля. */
export function allNavItems(isSuperuser: boolean): NavItem[] {
  return [...PRIMARY_NAV, ...menuSectionsFor(isSuperuser).flatMap((s) => s.items)];
}
