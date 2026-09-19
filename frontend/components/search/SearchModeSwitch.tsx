'use client';

import Link from 'next/link';
import { Flame, Globe, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Переключатель видов поиска в шапке на странице «Поиск»:
 * компании с карт и их отзывы · сайты из выдачи Яндекса и Google · поиск по боли.
 * Режимы — отдельные адреса (/app/leads, /app/leads?tab=sites, /app/pains), поэтому ссылки.
 */
const MODES = [
  {
    id: 'maps',
    href: '/app/leads',
    label: 'Компании на картах',
    short: 'Карты',
    hint: 'и их отзывы',
    icon: MapPin,
  },
  {
    id: 'sites',
    href: '/app/leads?tab=sites',
    label: 'Сайты в Яндексе и Google',
    short: 'Сайты',
    hint: 'со словами на страницах',
    icon: Globe,
  },
  {
    id: 'pains',
    href: '/app/pains',
    label: 'По боли',
    short: 'По боли',
    hint: 'кто уже жалуется',
    icon: Flame,
  },
] as const;

export function SearchModeSwitch({
  active,
  className,
}: {
  active: 'maps' | 'sites' | 'pains';
  className?: string;
}) {
  // 18.09: компактный сегмент в строке с заголовком «Поиск» — не спорит с формой за внимание.
  return (
    <nav
      aria-label="Вид поиска"
      className={cn('inline-flex max-w-full gap-0.5 rounded-full bg-ui-surface-2 p-1', className)}
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const on = m.id === active;
        return (
          <Link
            key={m.id}
            href={m.href}
            title={`${m.label} — ${m.hint}`}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-10 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-small font-semibold transition-all sm:min-h-0',
              on
                ? 'bg-ui-surface text-ui-text shadow-[0_1px_6px_rgba(0,0,0,0.1)]'
                : 'text-ui-text-muted hover:text-ui-text',
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', on && 'text-ui-accent')} aria-hidden />
            <span className="sm:hidden">{m.short}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
