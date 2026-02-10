'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  History,
  Ban,
  Settings,
  FileSearch,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ModuleId } from '@/lib/ModuleContext';

type NavItem = { href: string; label: string; icon: LucideIcon };

const MODULE_ITEMS: Record<ModuleId, { title: string; items: NavItem[] }> = {
  seo: {
    title: 'SEO',
    items: [
      { href: '/app/seo', label: 'Новый запрос', icon: Search },
      { href: '/runs', label: 'История', icon: History },
      { href: '/settings/blacklist', label: 'Блеклист', icon: Ban },
      { href: '/settings/providers', label: 'Настройки поиска', icon: Settings },
    ],
  },
  leads: {
    title: 'Поиск лидов',
    items: [
      { href: '/app/leads', label: 'Запрос', icon: Search },
      { href: '/app/leads/settings', label: 'Настройки', icon: Settings },
      { href: '/app/leads/history', label: 'История', icon: History },
      { href: '/app/leads/blacklist', label: 'Блеклист', icon: Ban },
    ],
  },
  tenders: {
    title: 'Госзакупки',
    items: [
      { href: '/app/gos', label: 'Текущий запрос', icon: FileSearch },
      { href: '/app/gos/history', label: 'История запросов', icon: History },
      { href: '/app/gos/settings', label: 'Настройки', icon: Settings },
    ],
  },
};

function getModuleFromPath(pathname: string | null): ModuleId {
  if (!pathname) return 'seo';
  if (pathname === '/dashboard' || pathname.startsWith('/seo') || pathname.startsWith('/app/seo') || pathname.startsWith('/runs') || pathname.startsWith('/settings')) return 'seo';
  if (pathname.startsWith('/leads') || pathname.startsWith('/app/leads')) return 'leads';
  if (pathname.startsWith('/tenders') || pathname.startsWith('/app/gos')) return 'tenders';
  return 'seo';
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + '/');
}

const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-focus-ring))] focus-visible:ring-offset-2 rounded-[6px]';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const moduleId = getModuleFromPath(pathname);
  const config = MODULE_ITEMS[moduleId];

  return (
    <aside
      className="flex flex-col shrink-0 border-r transition-[width] duration-200 ease-out"
      style={{
        width: collapsed ? 72 : 260,
        backgroundColor: 'hsl(var(--surface))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      <div className="flex h-14 items-center justify-end px-3 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`flex h-9 w-9 items-center justify-center rounded-[6px] transition-colors hover:bg-[hsl(var(--nav-hover-bg))] cursor-pointer ${focusClass}`}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          style={{ color: 'hsl(var(--nav-text))' }}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronLeft className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2" aria-label={config.title}>
        <div className="mb-4">
          {!collapsed && (
            <div
              className="mb-2 px-3 py-1 text-[12px] font-semibold"
              style={{ color: 'hsl(var(--text))' }}
            >
              {config.title}
            </div>
          )}
          <ul className="space-y-0.5">
            {config.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 h-9 px-3 rounded-[6px] text-[14px] transition-colors ${focusClass} ${
                      active
                        ? 'bg-[hsl(var(--nav-active-bg))] font-semibold'
                        : 'hover:bg-[hsl(var(--nav-hover-bg))] font-medium'
                    }`}
                    style={{ color: active ? 'hsl(var(--nav-active-text))' : 'hsl(var(--nav-text))' }}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </aside>
  );
}
