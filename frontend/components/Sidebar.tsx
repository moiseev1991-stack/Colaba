'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  History,
  Ban,
  Bookmark,
  ListPlus,
  Settings,
  FileSearch,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Mail,
  Inbox,
  BarChart3,
  Settings2,
  Users,
  Landmark,
  TrendingUp,
  Check,
  ShieldCheck,
  MapPin,
  Send,
  Flame,
  Database,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useModule, MODULE_ORDER, MODULE_LABELS, DISABLED_MODULES } from '@/lib/ModuleContext';
import type { ModuleId } from '@/lib/ModuleContext';
import { VersionBadge } from './VersionBadge';

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavSection = { title?: string; items: NavItem[] };

// Email block is identical across modules for now. When per-module campaigns/templates
// arrive, switch these to /app/{module}/email/* — same pages can stay, filtered by query.
const EMAIL_SECTION: NavSection = {
  title: 'Email-рассылка',
  items: [
    { href: '/app/email/campaigns', label: 'Кампании', icon: Mail },
    { href: '/app/email/replies', label: 'Ответы', icon: Inbox },
    { href: '/app/email/stats', label: 'Статистика', icon: BarChart3 },
    { href: '/app/email/settings', label: 'Настройка', icon: Settings2 },
  ],
};

// КП-шаблоны живут отдельной секцией, чтобы пункт не терялся среди «Поиск /
// Дашборд / История» — раньше пользователь его не находил. Доступно во всех
// модулях, поскольку шаблоны КП общие (хранятся пока в localStorage).
const PROPOSALS_SECTION: NavSection = {
  title: 'Коммерческие предложения',
  items: [
    { href: '/app/leads/proposals', label: 'Шаблоны КП', icon: FileText },
  ],
};

export const MODULE_NAV: Record<ModuleId, { sections: NavSection[] }> = {
  leads: {
    sections: [
      {
        items: [
          { href: '/app/leads', label: 'Поиск лидов', icon: Search },
          { href: '/app/pains', label: 'Поиск по боли', icon: Flame },
          { href: '/leads/dashboard', label: 'Дашборд', icon: LayoutDashboard },
          { href: '/app/leads/history', label: 'История', icon: History },
          // Раньше эти пункты были только через шапку /app/leads — юзер
          // их не находил, см. отчёт Chrome-агента 2026-06-07.
          { href: '/app/leads/presets', label: 'Мои пресеты', icon: Bookmark },
          { href: '/app/leads/lists', label: 'Мои списки', icon: ListPlus },
        ],
      },
      PROPOSALS_SECTION,
      EMAIL_SECTION,
      {
        title: 'Настройки',
        items: [
          { href: '/app/leads/settings', label: 'Параметры поиска', icon: Settings },
          { href: '/app/leads/blacklist', label: 'Блеклист', icon: Ban },
          { href: '/app/settings/maps-providers', label: 'Провайдеры карт', icon: MapPin },
          { href: '/app/settings/email-providers', label: 'Провайдеры email', icon: Mail },
          { href: '/app/settings/channels', label: 'Каналы рассылки', icon: Send },
        ],
      },
    ],
  },
  tenders: {
    sections: [
      {
        items: [
          { href: '/app/gos', label: 'Текущий запрос', icon: FileSearch },
          { href: '/tenders/dashboard', label: 'Дашборд', icon: LayoutDashboard },
          { href: '/app/gos/history', label: 'История', icon: History },
        ],
      },
      PROPOSALS_SECTION,
      EMAIL_SECTION,
      {
        title: 'Настройки',
        items: [
          { href: '/app/gos/settings', label: 'Параметры', icon: Settings },
          { href: '/app/settings/maps-providers', label: 'Провайдеры карт', icon: MapPin },
          { href: '/app/settings/email-providers', label: 'Провайдеры email', icon: Mail },
          { href: '/app/settings/channels', label: 'Каналы рассылки', icon: Send },
        ],
      },
    ],
  },
  seo: {
    sections: [
      {
        items: [
          { href: '/app/seo', label: 'Новый аудит', icon: Search },
          { href: '/seo/dashboard', label: 'Дашборд', icon: LayoutDashboard },
          { href: '/app/seo/templates', label: 'Шаблоны КП (SEO)', icon: FileText },
          { href: '/runs', label: 'История', icon: History },
        ],
      },
      PROPOSALS_SECTION,
      EMAIL_SECTION,
      {
        title: 'Настройки',
        items: [
          { href: '/settings/providers', label: 'Поисковые провайдеры', icon: Settings },
          { href: '/app/settings/maps-providers', label: 'Провайдеры карт', icon: MapPin },
          { href: '/app/settings/email-providers', label: 'Провайдеры email', icon: Mail },
          { href: '/app/settings/channels', label: 'Каналы рассылки', icon: Send },
          { href: '/settings/blacklist', label: 'Блеклист', icon: Ban },
        ],
      },
    ],
  },
};

export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  leads: Users,
  tenders: Landmark,
  seo: TrendingUp,
};

export function getBestMatch(pathname: string | null, items: NavItem[]): string | null {
  if (!pathname) return null;
  const matches = items
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    .sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-focus-ring))] focus-visible:ring-offset-2 rounded-[6px]';

function ModuleSwitcher({ collapsed }: { collapsed: boolean }) {
  const { module, setModule } = useModule();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ActiveIcon = MODULE_ICONS[module];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onResize = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  };

  const handlePick = (m: ModuleId) => {
    setOpen(false);
    if (m !== module) setModule(m);
  };

  // When collapsed, render a square icon button centered in the rail.
  // When expanded, full-width pill with label + chevron — original look.
  const button = collapsed ? (
    <button
      ref={btnRef}
      type="button"
      onClick={handleToggle}
      className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-all hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
      style={{ background: 'var(--brand-gradient)', color: 'white' }}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`Раздел: ${MODULE_LABELS[module]}`}
      title={MODULE_LABELS[module]}
    >
      <ActiveIcon className="h-5 w-5" aria-hidden />
    </button>
  ) : (
    <button
      ref={btnRef}
      type="button"
      onClick={handleToggle}
      className={`group flex w-full items-center gap-2 h-11 px-3 rounded-[10px] transition-all hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
      style={{
        background: 'hsl(var(--nav-active-bg))',
        color: 'hsl(var(--nav-active-text))',
      }}
      aria-haspopup="listbox"
      aria-expanded={open}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: 'var(--brand-gradient)', color: 'white' }}
        aria-hidden
      >
        <ActiveIcon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-left text-[14px] font-semibold truncate">
        {MODULE_LABELS[module]}
      </span>
      <ChevronDown
        className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        aria-hidden
      />
    </button>
  );

  // Dropdown is portaled to <body> with fixed coords so the rail's
  // `overflow-hidden` (needed for the width-collapse animation) can't clip it.
  const dropdown =
    open && rect && mounted
      ? createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            className="fixed z-[9999] rounded-[10px] border py-1 shadow-xl"
            style={{
              backgroundColor: 'hsl(var(--surface))',
              borderColor: 'hsl(var(--border))',
              top: rect.bottom + 6,
              left: collapsed ? rect.left : rect.left,
              width: collapsed ? 220 : rect.width,
            }}
          >
            {MODULE_ORDER.map((m) => {
              const Icon = MODULE_ICONS[m];
              const active = m === module;
              const disabled = DISABLED_MODULES.has(m);
              return (
                <button
                  key={m}
                  role="option"
                  aria-selected={active}
                  aria-disabled={disabled || undefined}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePick(m)}
                  title={disabled ? 'Модуль скоро будет доступен' : undefined}
                  className={`flex w-full items-center gap-2 h-10 px-3 text-left text-[14px] transition-colors ${focusClass} ${
                    disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-[hsl(var(--nav-hover-bg))]'
                  }`}
                  style={{
                    color: active ? 'hsl(var(--nav-active-text))' : 'hsl(var(--nav-text))',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: active ? 'hsl(var(--accent))' : undefined }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{MODULE_LABELS[m]}</span>
                  {active && (
                    <Check className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--accent))' }} aria-hidden />
                  )}
                  {disabled && (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        background: 'hsl(var(--surface-2))',
                        color: 'hsl(var(--muted))',
                        border: '1px solid hsl(var(--border))',
                      }}
                    >
                      скоро
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {button}
      {dropdown}
    </>
  );
}

// Админская секция. Видна только пользователю с `is_superuser=True`.
// Эндпоинт /api/v1/auth/me возвращает флаг — фронт его читает один раз
// при монтировании Sidebar и кэширует в state. Если 401/нет токена —
// просто не показываем секцию.
export const ADMIN_SECTION: NavSection = {
  title: 'Админ',
  items: [
    { href: '/app/admin/website-leads', label: 'Заявки с сайта', icon: ShieldCheck },
    { href: '/app/admin/data-inventory', label: 'Data inventory', icon: Database },
  ],
};

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const pathname = usePathname();
  const { module } = useModule();
  const config = MODULE_NAV[module];

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setCollapsed(true);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Проверяем is_superuser при монтировании Sidebar. В sessionStorage
  // кэшируем ТОЛЬКО положительный флаг — иначе после случайной 401
  // (медленный логин, гонка) секция «Админ» исчезала навсегда до
  // закрытия вкладки.
  useEffect(() => {
    const cached = typeof window !== 'undefined' ? sessionStorage.getItem('is_superuser') : null;
    if (cached === 'true') {
      setIsSuperuser(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const flag = Boolean(data?.is_superuser);
        if (!cancelled) {
          setIsSuperuser(flag);
          if (flag) {
            try { sessionStorage.setItem('is_superuser', 'true'); } catch { /* no-op */ }
          }
        }
      } catch {
        /* offline / no auth — Sidebar просто не покажет admin-секцию */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const effectiveCollapsed = isMobile ? true : collapsed;

  // Список секций для рендера: модульные + (опц.) админская.
  const sections = isSuperuser
    ? [...config.sections, ADMIN_SECTION]
    : config.sections;

  // Flat list of all items in the active module — for active-link resolution.
  const allItems = sections.flatMap((s) => s.items);
  const bestMatch = getBestMatch(pathname, allItems);

  return (
    <aside
      className="app-sidebar flex flex-col shrink-0 border-r relative overflow-hidden transition-[width] duration-200 ease-out"
      style={{
        width: effectiveCollapsed ? 72 : 260,
        backgroundColor: 'hsl(var(--surface) / 0.97)',
        borderColor: 'hsl(var(--border))',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'var(--brand-gradient)' }}
        aria-hidden="true"
      />

      {/* Header: module switcher (and collapse toggle when expanded).
          When the rail is collapsed there isn't enough room (72px) for both,
          so the toggle moves to the footer in that mode. */}
      <div
        className={`app-sidebar-header flex items-center h-14 border-b shrink-0 ${
          effectiveCollapsed ? 'justify-center px-2' : 'gap-2 px-3'
        }`}
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        {effectiveCollapsed ? (
          <ModuleSwitcher collapsed />
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <ModuleSwitcher collapsed={false} />
            </div>
            {!isMobile && (
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] transition-all hover:bg-[hsl(var(--nav-hover-bg))] hover:scale-105 cursor-pointer ${focusClass}`}
                aria-label="Свернуть меню"
                style={{ color: 'hsl(var(--nav-text))' }}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
            )}
          </>
        )}
      </div>

      {/* Expand button — sits right under the header in collapsed mode so
          it's always visible (the previous footer placement got hidden on
          light themes / shorter screens). */}
      {effectiveCollapsed && !isMobile && (
        <div className="px-2 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className={`flex h-9 w-full items-center justify-center rounded-[8px] border transition-all hover:scale-[1.03] ${focusClass}`}
            aria-label="Развернуть меню"
            title="Развернуть меню"
            style={{
              background: 'hsl(var(--surface-2))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--accent))',
            }}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Module-specific navigation */}
      <nav
        className={`flex-1 overflow-y-auto py-4 ${effectiveCollapsed ? 'px-2' : 'px-3'}`}
        aria-label={MODULE_LABELS[module]}
      >
        {sections.map((section, sectionIdx) => (
          <div key={sectionIdx} className={sectionIdx > 0 ? 'mt-5' : ''}>
            {!effectiveCollapsed && section.title && (
              <div
                className="mb-2 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'hsl(var(--accent))' }}
              >
                {section.title}
              </div>
            )}
            {/* Visual divider between sections in collapsed mode — section
                titles are hidden, so without it three groups blur into one. */}
            {effectiveCollapsed && sectionIdx > 0 && (
              <div
                className="mx-3 mb-3 h-px"
                style={{ background: 'hsl(var(--border))' }}
                aria-hidden
              />
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === bestMatch;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`relative flex items-center h-10 rounded-[8px] text-[14px] transition-all ${focusClass} ${
                        effectiveCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
                      } ${
                        active
                          ? 'font-semibold'
                          : 'hover:bg-[hsl(var(--nav-hover-bg))] font-medium'
                      }`}
                      style={{
                        color: active ? 'hsl(var(--nav-active-text))' : 'hsl(var(--nav-text))',
                        background: active ? 'hsl(var(--nav-active-bg))' : undefined,
                      }}
                      title={effectiveCollapsed ? item.label : undefined}
                    >
                      {active && (
                        <span
                          data-active-bar="true"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                          style={{ background: 'var(--brand-gradient)' }}
                          aria-hidden="true"
                        />
                      )}
                      <Icon
                        className="h-4 w-4 shrink-0 transition-colors"
                        style={{ color: active ? 'hsl(var(--accent))' : undefined }}
                        aria-hidden
                      />
                      {!effectiveCollapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: version badge (theme toggle moved to AppHeader) */}
      {!effectiveCollapsed && (
        <div
          className="shrink-0 px-3 py-3 border-t relative z-10"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="px-3">
            <VersionBadge />
          </div>
        </div>
      )}
    </aside>
  );
}
