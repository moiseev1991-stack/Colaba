'use client';

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// §4.15 ТЗ редизайна 2026-06-03 (Phase C batch 4): компактная панель прогресса
// на v2-токенах. Бренд-градиент для progress bar (был сплошной красный
// saas-primary), signal-good для финального состояния.

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
    <div
      className="w-full max-w-[900px] mx-auto rounded-v2-lg border shadow-v2-sm overflow-hidden"
      style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
    >
      <div
        className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        style={{ borderBottom: '1px solid hsl(var(--border))' }}
      >
        <div>
          <h2
            className="font-display font-semibold tracking-tight text-lg"
            style={{ color: 'hsl(var(--text))' }}
          >
            {title}
          </h2>
          <p className="text-sm" style={{ color: 'hsl(var(--muted))' }}>{subtitle}</p>
        </div>
        {done && (
          <span
            className="inline-flex items-center rounded-v2-sm px-2.5 py-1 text-xs font-medium shrink-0"
            style={{ background: 'var(--signal-good-bg)', color: 'var(--signal-good)' }}
          >
            Готово
          </span>
        )}
      </div>
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 shrink-0 flex items-center justify-center">
            {!done && (
              <Loader2 className="w-4 h-4 animate-spin text-brand-600 dark:text-brand-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium" style={{ color: 'hsl(var(--text))' }}>
                {indeterminate ? 'Обновление…' : `Прогресс: ${Math.round(Math.min(100, progress))}%`}
              </span>
              <span className="text-sm" style={{ color: 'hsl(var(--muted))' }}>{stepLabel}</span>
            </div>
            {indeterminate ? (
              <div
                className="mt-1.5 h-1.5 w-full rounded-pill overflow-hidden"
                style={{ background: 'hsl(var(--border))' }}
              >
                <div className="h-full w-1/3 rounded-pill bg-brand-500/60 animate-pulse" />
              </div>
            ) : (
              <div
                className="mt-1.5 h-2.5 w-full rounded-pill overflow-hidden"
                style={{ background: 'hsl(var(--border))' }}
              >
                <div
                  className={cn(
                    'h-full rounded-pill transition-all duration-150 ease-linear',
                    done ? 'bg-[var(--signal-good)]' : 'bg-brand-gradient',
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            )}
          </div>
        </div>
        {!done && (
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted))' }}>{label}</p>
        )}
      </div>
    </div>
  );
}
