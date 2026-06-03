'use client';

import { cn } from '@/lib/utils';
import { CardV2 } from './ui/CardV2';
import { SignalPill } from './ui/SignalPill';

// §4.10 ТЗ редизайна 2026-06-03 (Phase C batch 3): главное меню модулей.
// Активный модуль → CardV2 с brand-кольцом, остальные — заглушки с muted-плашкой.

interface ModuleCardsProps {
  activeModule?: 'seo' | 'contacts' | 'prices';
  onModuleClick?: (module: 'seo' | 'contacts' | 'prices') => void;
}

const MODULES = [
  { id: 'seo', title: 'SEO', desc: 'Аудит сайтов по SEO-метрикам и поиск проблем', enabled: true },
  { id: 'contacts', title: 'Контакты', desc: 'Поиск контактных данных компаний', enabled: false },
  { id: 'prices', title: 'Мониторинг цен', desc: 'Отслеживание изменений цен на товары', enabled: false },
] as const;

export function ModuleCards({ activeModule = 'seo', onModuleClick }: ModuleCardsProps) {
  return (
    <div className="reveal-stack grid grid-cols-1 lg:grid-cols-3 gap-6">
      {MODULES.map((m) => {
        const isActive = m.enabled && activeModule === m.id;
        return (
          <CardV2
            key={m.id}
            interactive={m.enabled}
            reveal
            className={cn(
              'p-6 transition-all',
              isActive && 'ring-2 ring-brand-500/40 shadow-v2-hover',
              !m.enabled && 'cursor-not-allowed opacity-60',
            )}
            onClick={() => m.enabled && onModuleClick?.(m.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <h3
                className="font-display font-semibold tracking-tight text-xl"
                style={{ color: 'hsl(var(--text))' }}
              >
                {m.title}
              </h3>
              {!m.enabled && <SignalPill tone="muted" size="sm">Скоро</SignalPill>}
            </div>
            <p className="text-sm" style={{ color: 'hsl(var(--muted))' }}>{m.desc}</p>
          </CardV2>
        );
      })}
    </div>
  );
}
