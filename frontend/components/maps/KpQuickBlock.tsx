'use client';

/**
 * KpQuickBlock — карточка-аха в шапке drawer'а с кнопкой «Сгенерировать КП».
 *
 * Заменяет старый OutreachDraftBlock в drawer'е (Эпик A1 ТЗ 2026-06-12):
 *  - старый блок жёг токены LLM каждый раз когда юзер открывал drawer
 *    (преграженный auto-angle), и юзер не успевал решить — нужно ли ему
 *    вообще письмо для этой компании;
 *  - новый блок ничего не грузит на open; юзер кликает «Сгенерировать КП» —
 *    открывается KpModal, выбирает шаблон, жмёт «Сгенерировать».
 *
 * Если у компании нет проанализированных болей (`hasPains=false`) — кнопка
 * disabled, tooltip объясняет почему. См. ТЗ A1.
 */

import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import { KpModal } from '@/components/maps/KpModal';

interface Props {
  companyId: number;
  companyName?: string;
  /** Есть ли у компании топ-боли с цитатами. Если нет — кнопка disabled. */
  hasPains: boolean;
}

export function KpQuickBlock({ companyId, companyName, hasPains }: Props) {
  const [open, setOpen] = useState(false);

  const disabled = !hasPains;
  const tooltip = disabled
    ? 'У компании нет проанализированных отзывов — сначала запусти AI-анализ из шапки выдачи'
    : 'Сгенерировать коммерческое предложение под боль клиентов из отзывов';

  return (
    <div className="rounded-md border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3 dark:border-violet-700/40 dark:from-violet-900/30 dark:to-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-900 dark:text-violet-100">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Коммерческое предложение
          </div>
          <p className="mt-0.5 text-[11.5px] text-slate-600 dark:text-slate-300">
            {disabled
              ? 'AI ещё не разобрал отзывы — без них письмо будет общим.'
              : 'Холодное письмо под главную боль клиентов с цитатой из отзыва.'}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          title={tooltip}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-600"
        >
          <Sparkles className="h-4 w-4" />
          КП
        </button>
      </div>

      <KpModal
        open={open}
        companyId={companyId}
        companyName={companyName}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
