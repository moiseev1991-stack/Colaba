'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

// §4.15 ТЗ редизайна 2026-06-03 (Phase C batch 4): LoadingHero на v2.
// Орбитальный спиннер и шаги остались — только цвета (был агрессивный red-500,
// теперь бренд-эмеральд) и токены. Поведение анимации, шаги, ms — те же.

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
        className="rounded-v2-lg border shadow-v2-sm min-h-[200px] sm:min-h-[240px] md:min-h-[280px] flex flex-col overflow-hidden"
        style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
      >
        {/* Meta line — top */}
        {meta && (meta.query || meta.provider || meta.city || meta.status) && (
          <div
            className="px-4 py-2.5"
            style={{
              background: 'hsl(var(--surface-2))',
              borderBottom: '1px solid hsl(var(--border))',
            }}
          >
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs"
              style={{ color: 'hsl(var(--muted))' }}
            >
              {meta.query && (
                <span>
                  <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>Запрос:</span>{' '}
                  {meta.query}
                </span>
              )}
              {meta.city && (
                <span>
                  <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>Город:</span>{' '}
                  {meta.city}
                </span>
              )}
              {providerLabel && (
                <span>
                  <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>Провайдер:</span>{' '}
                  {providerLabel}
                </span>
              )}
              {meta.status && (
                <span>
                  <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>Статус:</span>{' '}
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
              className="absolute w-full h-full text-brand-500 dark:text-brand-400 animate-spin"
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
                    className="w-full h-full rounded-full bg-brand-500 dark:bg-brand-400 animate-pulse-dot"
                    style={{ animationDelay: `${i * 0.25}s` }}
                  />
                </div>
              ))}
            </div>
          </div>

          <h2
            className="font-display font-semibold tracking-tight text-xl sm:text-2xl md:text-3xl text-center mb-1"
            style={{ color: 'hsl(var(--text))' }}
          >
            {title}
          </h2>
          <p
            className="text-sm sm:text-base text-center max-w-md"
            style={{ color: 'hsl(var(--muted))' }}
          >
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
                        'flex items-center gap-2 rounded-v2-sm px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm transition-colors border',
                        done &&
                          'bg-[var(--signal-good-bg)] text-[color:var(--signal-good)] border-[var(--signal-good)]/30',
                        current &&
                          'bg-[var(--signal-warm-bg)] text-[color:var(--signal-warm)] border-[var(--signal-warm)]/30 ring-1 ring-[var(--signal-warm)]/40',
                        !done && !current &&
                          'bg-[hsl(var(--surface-2))] td-muted',
                      )}
                      style={!done && !current ? { borderColor: 'hsl(var(--border))' } : undefined}
                    >
                      {done ? (
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--signal-good)' }} />
                      ) : current ? (
                        <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: 'var(--signal-warm)' }} />
                      ) : (
                        <span className="w-4 h-4 flex-shrink-0 rounded-full" style={{ background: 'hsl(var(--border))' }} />
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
        <div
          className="rounded-v2-lg border shadow-v2-sm overflow-hidden"
          style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
        >
          {/* Desktop: table rows */}
          <div className="hidden md:block p-4">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-4 w-8 flex-shrink-0 skel-v2" />
                  <div className="h-4 flex-1 max-w-[200px] skel-v2" />
                  <div className="h-4 w-16 skel-v2" />
                  <div className="h-4 w-20 skel-v2" />
                  <div className="h-8 w-24 flex-shrink-0 skel-v2" />
                </div>
              ))}
            </div>
          </div>
          {/* Mobile: cards */}
          <div className="md:hidden p-3 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-v2-sm border p-3"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <div className="h-4 w-3/4 mb-2 skel-v2" />
                <div className="flex gap-2 mb-2">
                  <div className="h-3 w-12 skel-v2" />
                  <div className="h-3 w-16 skel-v2" />
                </div>
                <div className="h-3 w-full skel-v2" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
