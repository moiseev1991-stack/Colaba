'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { OUTREACH_SENDING_ENABLED, SENDING_SOON_HINT } from '@/lib/outreach';
import type { NavSection } from './appNav';

/**
 * Список пунктов меню профиля — общий для выпадающего меню в шапке и листа «Ещё» на телефоне.
 */
export function NavMenuList({
  sections,
  activeHref,
  email,
  onNavigate,
  onLogout,
  large = false,
}: {
  sections: NavSection[];
  activeHref: string | null;
  email: string | null;
  onNavigate: () => void;
  onLogout: () => void;
  /** Крупные строки (44px) для телефона. */
  large?: boolean;
}) {
  const row = cn(
    'flex w-full items-center gap-2.5 rounded-control px-3 text-left transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40',
    large ? 'h-11 text-base' : 'h-9 text-sm',
  );

  return (
    <div>
      {email && <div className="truncate px-3 pb-2 pt-1 text-xs text-ui-text-muted">{email}</div>}
      {sections.map((section) => (
        <div key={section.title} className="border-t border-ui-border py-1.5">
          {section.title && <div className="px-3 pb-1 pt-1.5 text-xs font-semibold text-ui-text-muted">{section.title}</div>}
          <ul>
            {section.items.map((item) => {
              const Icon = item.icon;
              if (item.requiresSending && !OUTREACH_SENDING_ENABLED) {
                return (
                  <li key={item.href}>
                    <span aria-disabled="true" title={SENDING_SOON_HINT} className={cn(row, 'cursor-not-allowed text-ui-text opacity-50')}>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      <Badge size="sm">скоро</Badge>
                    </span>
                  </li>
                );
              }
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(row, active ? 'bg-ui-accent/10 font-semibold text-ui-accent' : 'text-ui-text hover:bg-ui-surface-2')}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="border-t border-ui-border pt-1.5">
        <button type="button" onClick={onLogout} className={cn(row, 'text-ui-text hover:bg-ui-surface-2')}>
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          Выйти
        </button>
      </div>
    </div>
  );
}
