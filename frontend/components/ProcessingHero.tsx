'use client';

import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

/** 0–25%, 25–55%, 55–80%, 80–100% */
const STEPS = [
  'Парсим выдачу',
  'Собираем домены',
  'Ищем robots.txt и sitemap',
  'Проверяем meta-теги и H1',
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  duckduckgo: 'DuckDuckGo',
  yandex_html: 'Яндекс HTML',
  google_html: 'Google HTML',
  yandex_xml: 'Яндекс XML',
  serpapi: 'SerpAPI',
};

export interface ProcessingHeroMeta {
  query?: string;
  provider?: string;
  city?: string;
  status?: string;
}

interface ProcessingHeroProps {
  title?: string;
  subtitle?: string;
  meta?: ProcessingHeroMeta;
  /** 0–100. If provided, show determinate progress bar and steps from progress. */
  progress?: number;
  showSteps?: boolean;
  showSkeleton?: boolean;
}

function activeStepFromProgress(progress: number): number {
  if (progress >= 80) return 3;
  if (progress >= 55) return 2;
  if (progress >= 25) return 1;
  return 0;
}

export function ProcessingHero({
  title = 'Идёт поиск лидов…',
  subtitle = 'Собираем выдачу и делаем быстрый SEO-аудит',
  meta,
  progress,
  showSteps = true,
  showSkeleton = true,
}: ProcessingHeroProps) {
  const determinate = typeof progress === 'number';
  const pct = progress ?? 0;
  const activeStep = determinate ? activeStepFromProgress(pct) : 0;
  const progressLabel = determinate
    ? `Прогресс: ${Math.round(pct)}%`
    : 'Собираем результаты…';
  const stepLabel = determinate ? `Шаг ${activeStep + 1}/4` : null;

  const providerLabel = meta?.provider ? (PROVIDER_LABELS[meta.provider] ?? meta.provider) : null;
  const statusText =
    meta?.status === 'processing' || meta?.status === 'pending'
      ? 'Собираем результаты…'
      : meta?.status ?? '';

  return (
    <div
      className={cn(
        'rounded-[14px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm overflow-hidden w-full'
      )}
    >
      {/* Meta row — compact badges */}
      {meta && (meta.query || meta.provider || meta.city || meta.status) && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            {meta.query && (
              <span className="inline-flex rounded bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                {meta.query}
              </span>
            )}
            {meta.city && (
              <span className="inline-flex rounded bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                {meta.city}
              </span>
            )}
            {providerLabel && (
              <span className="inline-flex rounded bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                {providerLabel}
              </span>
            )}
            <span className="inline-flex rounded bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-800 dark:text-red-200">
              {statusText || 'Собираем результаты…'}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center px-4 py-4 md:py-5 min-h-[120px] md:min-h-[140px]">
        <div className="flex flex-col items-center w-full max-w-md">
          <div className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center mb-3">
            <svg
              className="w-full h-full text-red-600 dark:text-red-400 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="24 38"
                opacity={0.3}
              />
            </svg>
          </div>

          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white text-center mb-0.5">
            {title}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-3">
            {subtitle}
          </p>

          {determinate ? (
            <div className="w-full space-y-1.5 mb-3">
              <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-400">
                <span>{progressLabel}</span>
                {stepLabel && <span>{stepLabel}</span>}
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-saas-primary transition-all duration-150 ease-linear"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Собираем результаты…</p>
          )}

          {showSteps && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {STEPS.map((step, index) => {
                const done = index < activeStep || (determinate && pct >= 100);
                const current = index === activeStep && pct < 100;
                return (
                  <span
                    key={index}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-xs font-medium transition-colors',
                      done &&
                        'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
                      current &&
                        'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 ring-1 ring-red-300 dark:ring-red-600',
                      !done &&
                        !current &&
                        'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    )}
                  >
                    {done ? (
                      <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : current ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600 dark:text-red-400 flex-shrink-0" />
                    ) : null}
                    <span className="truncate max-w-[140px]">{step}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showSkeleton && (
        <div
          className={cn(
            'border-t border-gray-200 dark:border-gray-600 max-h-[280px] md:max-h-[320px] overflow-hidden'
          )}
        >
          <div className="hidden md:block p-3">
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8 flex-shrink-0" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1 max-w-[200px]" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                  <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
          <div className="md:hidden p-3 space-y-2 max-h-[280px] overflow-auto">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-lg bg-gray-100 dark:bg-gray-800/50 p-3 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                <div className="flex gap-2 mb-1">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                </div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
