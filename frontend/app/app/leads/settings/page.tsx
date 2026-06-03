'use client';

import Link from 'next/link';
import { Settings, List, Search, ChevronRight } from 'lucide-react';
import { CardV2 } from '@/components/ui/CardV2';

// §4.8 ТЗ редизайна 2026-06-03 (Phase C batch 1): сетка ссылок-настроек на CardV2,
// с hover-lift и бренд-иконками вместо blue-600.
const ITEMS = [
  {
    href: '/app/leads/blacklist',
    icon: List,
    title: 'Чёрный список доменов',
    desc: 'Домены, которые исключаются из результатов поиска',
  },
  {
    href: '/settings/providers',
    icon: Settings,
    title: 'Провайдеры поиска',
    desc: 'Настройки API-ключей для Яндекс XML, SerpAPI',
  },
  {
    href: '/settings/captcha',
    icon: Search,
    title: 'Обход капчи',
    desc: '2captcha, anticaptcha и другие сервисы',
  },
] as const;

export default function LeadsSettingsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <h1
        className="flex items-center gap-2 mb-6 font-display font-semibold tracking-tight"
        style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
      >
        <Settings className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        Настройки поиска лидов
      </h1>

      <div className="reveal-stack grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ITEMS.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href} className="block">
            <CardV2 interactive reveal className="p-6 group h-full">
              <div className="flex items-start justify-between mb-3">
                <div className="rounded-v2-sm bg-brand-50 p-2 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  <Icon className="h-6 w-6" />
                </div>
                <ChevronRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  style={{ color: 'hsl(var(--muted))' }}
                />
              </div>
              <h2
                className="font-display font-semibold tracking-tight text-[15px] mb-1"
                style={{ color: 'hsl(var(--text))' }}
              >
                {title}
              </h2>
              <p className="text-[13px]" style={{ color: 'hsl(var(--muted))' }}>{desc}</p>
            </CardV2>
          </Link>
        ))}
      </div>
    </div>
  );
}
