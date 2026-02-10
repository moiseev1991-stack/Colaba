'use client';

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const STEPS = [
  'Парсим выдачу',
  'Собираем домены',
  'Проверяем robots.txt и sitemap',
  'Проверяем meta-теги и H1',
] as const;

/** 0–24%, 25–49%, 50–74%, 75–99%, 100% = Готово */
function stepFromProgress(p: number): { index: number; label: string; done: boolean } {
  if (p >= 100) return { index: 4, label: 'Готово', done: true };
  if (p >= 75) return { index: 3, label: STEPS[3], done: false };
  if (p >= 50) return { index: 2, label: STEPS[2], done: false };
  if (p >= 25) return { index: 1, label: STEPS[1], done: false };
  return { index: 0, label: STEPS[0], done: false };
}

interface LoadingProcessPanelProps {
  progress: number;
  title?: string;
  subtitle?: string;
  /** Без прогресс-бара: «Обновление…», шаг переключается снаружи */
  indeterminate?: boolean;
  /** Для indeterminate: 0–3 */
  step?: number;
}

export function LoadingProcessPanel({
  progress,
  title = 'Идёт поиск лидов…',
  subtitle = 'Собираем выдачу и делаем быстрый SEO-аудит',
  indeterminate = false,
  step: externalStep,
}: LoadingProcessPanelProps) {
  const fromProgress = stepFromProgress(progress);
  const index = indeterminate && typeof externalStep === 'number' ? externalStep : fromProgress.index;
  const label = indeterminate && typeof externalStep === 'number' ? STEPS[Math.min(externalStep, 3)] : fromProgress.label;
  const done = !indeterminate && fromProgress.done;
  const stepLabel = done ? 'Готово' : `Шаг ${index + 1}/4`;

  return (
    <div className="w-full max-w-[900px] mx-auto rounded-[14px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-md overflow-hidden">
      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200 dark:border-gray-600">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        {done && (
          <span className="inline-flex items-center rounded-[10px] bg-green-100 dark:bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-800 dark:text-green-200 shrink-0">
            Готово
          </span>
        )}
      </div>
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 shrink-0 flex items-center justify-center">
            {!done && (
              <Loader2 className="w-4 h-4 text-red-600 dark:text-red-400 animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {indeterminate ? 'Обновление…' : `Прогресс: ${Math.round(Math.min(100, progress))}%`}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{stepLabel}</span>
            </div>
            {indeterminate ? (
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-red-500/60 animate-pulse" />
              </div>
            ) : (
              <div className="mt-1.5 h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-150 ease-linear',
                    done ? 'bg-green-600 dark:bg-green-500' : 'bg-saas-primary'
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            )}
          </div>
        </div>
        {!done && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
        )}
      </div>
    </div>
  );
}
