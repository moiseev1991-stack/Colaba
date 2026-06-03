'use client';

import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

// §4.14 ТЗ редизайна 2026-06-03 (Phase C batch 4): «Идёт поиск лидов» на v2.
// Все статусные плашки переехали на signal-tokens, бренд-цвет (был красный
// hue!) — на brand. Скелетоны на skel-v2 shimmer.

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
      className="rounded-v2-lg border shadow-v2-sm overflow-hidden w-full"
      style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
    >
      {/* Meta row — compact badges */}
      {meta && (meta.query || meta.provider || meta.city || meta.status) && (
        <div
          className="px-3 py-2"
          style={{
            background: 'hsl(var(--surface-2))',
            borderBottom: '1px solid hsl(var(--border))',
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {meta.query && <MetaPill>{meta.query}</MetaPill>}
            {meta.city && <MetaPill>{meta.city}</MetaPill>}
            {providerLabel && <MetaPill>{providerLabel}</MetaPill>}
            <span
              className="inline-flex rounded-v2-sm px-2 py-0.5 text-xs font-medium"
              style={{
                background: 'var(--signal-warm-bg)',
                color: 'var(--signal-warm)',
              }}
            >
              {statusText || 'Собираем результаты…'}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center px-4 py-4 md:py-5 min-h-[120px] md:min-h-[140px]">
        <div className="flex flex-col items-center w-full max-w-md">
          <div className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center mb-3">
            <svg
              className="w-full h-full text-brand-600 dark:text-brand-400 animate-spin"
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

          <h2
            className="font-display font-semibold tracking-tight text-xl md:text-2xl text-center mb-0.5"
            style={{ color: 'hsl(var(--text))' }}
          >
            {title}
          </h2>
          <p
            className="text-sm text-center mb-3"
            style={{ color: 'hsl(var(--muted))' }}
          >
            {subtitle}
          </p>

          {determinate ? (
            <div className="w-full space-y-1.5 mb-3">
              <div
                className="flex justify-between text-xs font-medium"
                style={{ color: 'hsl(var(--muted))' }}
              >
                <span>{progressLabel}</span>
                {stepLabel && <span>{stepLabel}</span>}
              </div>
              <div
                className="h-2 w-full rounded-pill overflow-hidden"
                style={{ background: 'hsl(var(--border))' }}
              >
                <div
                  className="h-full rounded-pill bg-brand-gradient transition-all duration-150 ease-linear"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs mb-3" style={{ color: 'hsl(var(--muted))' }}>Собираем результаты…</p>
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
                      'inline-flex items-center gap-1 rounded-v2-sm px-2 py-1 text-xs font-medium transition-colors',
                      done && 'bg-[var(--signal-good-bg)] text-[color:var(--signal-good)]',
                      current &&
                        'bg-[var(--signal-warm-bg)] text-[color:var(--signal-warm)] ring-1 ring-[var(--signal-warm)]/40',
                      !done && !current &&
                        'bg-[hsl(var(--surface-2))] td-muted',
                    )}
                  >
                    {done ? (
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--signal-good)' }} />
                    ) : current ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 text-brand-600 dark:text-brand-400" />
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
          className="max-h-[280px] md:max-h-[320px] overflow-hidden"
          style={{ borderTop: '1px solid hsl(var(--border))' }}
        >
          <div className="hidden md:block p-3">
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 w-8 flex-shrink-0 skel-v2" />
                  <div className="h-4 flex-1 max-w-[200px] skel-v2" />
                  <div className="h-4 w-16 skel-v2" />
                  <div className="h-4 w-20 skel-v2" />
                  <div className="h-8 w-24 flex-shrink-0 skel-v2" />
                </div>
              ))}
            </div>
          </div>
          <div className="md:hidden p-3 space-y-2 max-h-[280px] overflow-auto">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-v2-sm p-3"
                style={{ background: 'hsl(var(--surface-2))' }}
              >
                <div className="h-4 w-3/4 mb-2 skel-v2" />
                <div className="flex gap-2 mb-1">
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

// Метa-плашка под шапкой (запрос / город / провайдер). Серая, тонированная
// под surface-2 — чтобы не конкурировала с warm-плашкой статуса справа.
function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex rounded-v2-sm px-2 py-0.5 text-xs font-medium border"
      style={{
        background: 'hsl(var(--surface))',
        borderColor: 'hsl(var(--border))',
        color: 'hsl(var(--text))',
      }}
    >
      {children}
    </span>
  );
}
