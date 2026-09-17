'use client';

import Link from 'next/link';
import { Flame, Globe, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Переключатель видов поиска над формой на странице «Поиск»:
 * компании с карт и их отзывы · сайты из выдачи Яндекса и Google · поиск по боли.
 * Режимы — отдельные адреса (/app/leads, /app/leads?tab=sites, /app/pains), поэтому ссылки.
 */
const MODES = [
  {
    id: 'maps',
    href: '/app/leads',
    label: 'Компании на картах',
    hint: 'и их отзывы',
    icon: MapPin,
  },
  {
    id: 'sites',
    href: '/app/leads?tab=sites',
    label: 'Сайты в Яндексе и Google',
    hint: 'со словами на страницах',
    icon: Globe,
  },
  { id: 'pains', href: '/app/pains', label: 'По боли', hint: 'кто уже жалуется', icon: Flame },
] as const;

export function SearchModeSwitch({
  active,
  className,
}: {
  active: 'maps' | 'sites' | 'pains';
  className?: string;
}) {
  return (
    <nav
      aria-label="Вид поиска"
      className={cn(
        'mx-auto grid w-full max-w-[880px] grid-cols-3 gap-1 rounded-panel bg-ui-surface-2 p-1',
        className,
      )}
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const on = m.id === active;
        return (
          <Link
            key={m.id}
            href={m.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-14 items-center justify-center gap-2 rounded-card px-2 py-2 text-left transition-all sm:justify-start sm:px-3.5',
              on
                ? 'bg-ui-surface text-ui-text shadow-[0_2px_10px_rgba(0,0,0,0.1)]'
                : 'text-ui-text-muted hover:bg-ui-surface/60 hover:text-ui-text',
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', on && 'text-ui-accent')} aria-hidden />
            <span className="min-w-0">
              <span className="block text-xs font-semibold leading-tight sm:text-small">
                {m.label}
              </span>
              <span className="hidden text-xs leading-tight text-ui-text-muted sm:block">
                {m.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
