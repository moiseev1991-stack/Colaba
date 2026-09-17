'use client';

/**
 * Шаг 1 онбординга — «Кто вы?». 4 карточки профессии.
 *
 * Выбор сохраняется в localStorage и:
 *  - выставляет дефолт template_key для KpModal (Эпик A)
 *  - на /app/leads автоматически активирует chip «Под профессию» (Эпик C)
 *
 * 4-я карточка — «Другое» (без профессии). Юзер всё равно проходит онбординг,
 * получает обычную выдачу без chip'а, и в KpModal выбирает шаблон сам.
 */

import { Briefcase, MoreHorizontal, Search, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { ProfessionPresetKey } from '@/components/maps/professionPresets';

export type ProfessionChoice = ProfessionPresetKey | 'other';

interface Card {
  key: ProfessionChoice;
  /** Иконка карточки. */
  icon: ReactNode;
  title: string;
  description: string;
  /** kpTemplateKey для KpModal. Для 'other' — null (юзер выберет сам). */
  kpTemplateKey: string | null;
}

const CARDS: Card[] = [
  {
    key: 'for_webstudio',
    icon: <Wrench className="h-6 w-6" />,
    title: 'Веб-студия / разработка',
    description: 'Продаёте сайты, онлайн-запись, интернет-магазины',
    kpTemplateKey: 'webstudio',
  },
  {
    key: 'for_seo',
    icon: <Search className="h-6 w-6" />,
    title: 'SEO / продвижение',
    description: 'Продвигаете в поиске и на картах',
    kpTemplateKey: 'seo',
  },
  {
    key: 'for_marketing',
    icon: <Briefcase className="h-6 w-6" />,
    title: 'Маркетинг / реклама',
    description: 'Приводите клиентов через рекламу и контент',
    kpTemplateKey: 'marketing',
  },
  {
    key: 'other',
    icon: <MoreHorizontal className="h-6 w-6" />,
    title: 'Другое',
    description: 'Свой профиль — шаблон письма выберете при генерации',
    kpTemplateKey: null,
  },
];

interface Props {
  selected: ProfessionChoice | null;
  onSelect: (choice: ProfessionChoice, kpTemplateKey: string | null) => void;
}

export function ProfessionStep({ selected, onSelect }: Props) {
  return (
    <div>
      <h2 className="text-heading font-extrabold tracking-tight text-ui-text">Кто вы?</h2>
      <p className="mt-1 text-sm text-ui-text-muted">
        Подберём готовые фильтры выдачи под вашу услугу и шаблон первого письма. Это можно изменить
        в любой момент.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CARDS.map((card) => {
          const active = selected === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onSelect(card.key, card.kpTemplateKey)}
              className={cn(
                'group flex items-start gap-3 rounded-card border p-4 text-left transition-colors duration-fast',
                active
                  ? 'border-ui-accent bg-ui-accent/[.06] shadow-raised'
                  : 'border-ui-border bg-ui-surface hover:border-ui-accent/40 hover:bg-ui-surface-2',
              )}
            >
              <div
                className={cn(
                  'rounded-control p-2 transition-colors duration-fast',
                  active
                    ? 'bg-ui-accent text-ui-accent-contrast'
                    : 'bg-ui-surface-2 text-ui-text-muted group-hover:text-ui-accent',
                )}
              >
                {card.icon}
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-ui-text">{card.title}</div>
                <div className="mt-0.5 text-small text-ui-text-muted">{card.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
