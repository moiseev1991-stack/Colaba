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
    description: 'Свой профиль — шаблон письма выберешь в момент генерации',
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
      <h2 className="text-[22px] font-semibold text-slate-900 dark:text-slate-100">
        Кто вы?
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Это нужно, чтобы сразу подобрать готовые фильтры выдачи и шаблон письма.
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
                'group flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                active
                  ? 'border-violet-600 bg-violet-50 shadow-sm dark:border-violet-400 dark:bg-violet-900/30'
                  : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
              )}
            >
              <div
                className={cn(
                  'rounded-md p-2',
                  active
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-700 group-hover:bg-violet-200 group-hover:text-violet-800 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                {card.icon}
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                  {card.title}
                </div>
                <div className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-400">
                  {card.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
