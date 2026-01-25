'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

const STEPS = [
  'Парсим выдачу поисковой системы',
  'Собираем домены',
  'Ищем robots.txt и sitemap',
  'Проверяем meta-теги и H1',
];

const PROVIDER_LABELS: Record<string, string> = {
  duckduckgo: 'DuckDuckGo',
  yandex_html: 'Яндекс HTML',
  google_html: 'Google HTML',
  yandex_xml: 'Яндекс XML',
  serpapi: 'SerpAPI',
};

export interface LoadingHeroMeta {
  query?: string;
  provider?: string;
  city?: string;
  status?: string;
}

interface LoadingHeroProps {
  title?: string;
  subtitle?: string;
  meta?: LoadingHeroMeta;
  showSteps?: boolean;
  showSkeleton?: boolean;
}

export function LoadingHero({
  title = 'Идёт поиск лидов…',
  subtitle = 'Собираем выдачу и проводим быстрый SEO-аудит',
  meta,
  showSteps = true,
  showSkeleton = true,
}: LoadingHeroProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActiveStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, 2500);
    return () => clearInterval(t);
  }, []);

  const providerLabel = meta?.provider ? (PROVIDER_LABELS[meta.provider] ?? meta.provider) : null;

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div
        className={cn(
          'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm',
          'min-h-[200px] sm:min-h-[240px] md:min-h-[280px] flex flex-col overflow-hidden'
        )}
      >
        {/* Meta line — top */}
        {meta && (meta.query || meta.provider || meta.city || meta.status) && (
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-800/80">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
              {meta.query && (
                <span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Запрос:</span>{' '}
                  {meta.query}
                </span>
              )}
              {meta.city && (
                <span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Город:</span>{' '}
                  {meta.city}
                </span>
              )}
              {providerLabel && (
                <span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Провайдер:</span>{' '}
                  {providerLabel}
                </span>
              )}
              {meta.status && (
                <span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Статус:</span>{' '}
                  {meta.status === 'processing' || meta.status === 'pending'
                    ? 'Собираем…'
                    : meta.status}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Center: title, subtitle, animation */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8">
          {/* Orbital spinner: central circle + 3 orbiting dots */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 flex items-center justify-center mb-4 sm:mb-5">
            <svg
              className="absolute w-full h-full text-red-500 dark:text-red-400 animate-spin"
              viewBox="0 0 100 100"
              fill="none"
            >
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="80 180"
              />
            </svg>
            <div
              className="absolute inset-0 animate-orbit"
              style={{ animationDuration: '3s' }}
            >
              {[0, 120, 240].map((deg, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 left-1/2 w-3 h-3 sm:w-4 sm:h-4 -mt-[6px] sm:-mt-2 -ml-[6px] sm:-ml-2"
                  style={{
                    transform: `rotate(${deg}deg) translateY(-36px)`,
                  }}
                >
                  <div
                    className="w-full h-full rounded-full bg-red-500 dark:bg-red-400 animate-pulse-dot"
                    style={{ animationDelay: `${i * 0.25}s` }}
                  />
                </div>
              ))}
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center mb-1">
            {title}
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 text-center max-w-md">
            {subtitle}
          </p>

          {/* Steps — chips */}
          {showSteps && (
            <div className="mt-5 sm:mt-6 w-full max-w-2xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                {STEPS.map((step, index) => {
                  const done = index < activeStep;
                  const current = index === activeStep;
                  return (
                    <div
                      key={index}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm transition-colors',
                        done &&
                          'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800/50',
                        current &&
                          'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800/50 ring-1 ring-red-300/50 dark:ring-red-600/30',
                        !done &&
                          !current &&
                          'bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                      )}
                    >
                      {done ? (
                        <Check className="w-4 h-4 flex-shrink-0 text-green-600 dark:text-green-400" />
                      ) : current ? (
                        <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-red-600 dark:text-red-400" />
                      ) : (
                        <span className="w-4 h-4 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
                      )}
                      <span className="line-clamp-2">{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Skeleton placeholder */}
      {showSkeleton && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          {/* Desktop: table rows */}
          <div className="hidden md:block p-4">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8 flex-shrink-0" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1 max-w-[200px]" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                  <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
          {/* Mobile: cards */}
          <div className="md:hidden p-3 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 animate-pulse"
              >
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                <div className="flex gap-2 mb-2">
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
