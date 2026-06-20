'use client';

/**
 * Мини-калькулятор «что я выжму из этой партии».
 *
 * Вешается рядом с bulk-генерацией (страница setup'а партии, при
 * желании — и в шапку партии). Показывает воронку:
 *   N писем × reply rate → ответы × deal rate → сделки × средний чек → выручка
 *
 * Бенчмарки (дефолты) — типовые цифры cold B2B в РФ:
 *   reply_rate = 1.5%  (диапазон 0.5–5%)
 *   deal_rate  = 15%   (доля ответов → встреча → договор; диапазон 5–35%)
 *   avg_deal_value = 50000 ₽ (мин 5000, шаг свободный)
 *
 * Источник цифр: вторичные данные (Salesloft/Lemlist обзоры 2024-2025) +
 * собственный опыт юзера. Цифры консервативные — лучше пусть юзер
 * приятно удивится, чем разочаруется.
 *
 * Состояние слайдеров — в localStorage, чтобы при следующей партии
 * не пере-заполнял каждый раз.
 */

import { useEffect, useMemo, useState } from 'react';
import { Calculator, ChevronDown } from 'lucide-react';

import { CardV2 } from '@/components/ui/CardV2';
import { cn } from '@/lib/utils';

interface ColdEmailCalculatorProps {
  /** Сколько КП будет в партии. Из выделения юзера. */
  letterCount: number;
  /** Кастомный заголовок (на странице партии можно поставить «При полной
   *  отправке этой партии получится…»). */
  title?: string;
  className?: string;
}

interface StoredPrefs {
  reply_rate_pct: number;   // 0.5–5
  deal_rate_pct: number;    // 5–35
  avg_deal_value: number;   // ₽
  collapsed?: boolean;
}

const LS_KEY = 'colaba-cold-calculator-v1';

const DEFAULTS: StoredPrefs = {
  reply_rate_pct: 1.5,
  deal_rate_pct: 15,
  avg_deal_value: 50_000,
};

function loadPrefs(): StoredPrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      reply_rate_pct: clampNumber(parsed.reply_rate_pct, 0.1, 10, DEFAULTS.reply_rate_pct),
      deal_rate_pct: clampNumber(parsed.deal_rate_pct, 1, 60, DEFAULTS.deal_rate_pct),
      avg_deal_value: clampNumber(parsed.avg_deal_value, 1_000, 10_000_000, DEFAULTS.avg_deal_value),
      collapsed: Boolean(parsed.collapsed),
    };
  } catch {
    return DEFAULTS;
  }
}

function savePrefs(prefs: StoredPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage full / disabled — игнор, на следующей сессии возьмём дефолты
  }
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function formatRub(value: number): string {
  if (!Number.isFinite(value)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatCount(value: number): string {
  // До 1 — показываем 1 знак после запятой, чтобы было видно «0.5 ответа».
  if (value < 1) return value.toFixed(1).replace('.', ',');
  return Math.round(value).toLocaleString('ru-RU');
}

export function ColdEmailCalculator({
  letterCount,
  title = 'Что выжмем из партии?',
  className,
}: ColdEmailCalculatorProps) {
  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULTS);
  // Initial load — отделено от рендера чтобы избежать hydration mismatch.
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const collapsed = prefs.collapsed ?? false;

  function update(patch: Partial<StoredPrefs>): void {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }

  const result = useMemo(() => {
    const replies = letterCount * (prefs.reply_rate_pct / 100);
    const deals = replies * (prefs.deal_rate_pct / 100);
    const revenue = deals * prefs.avg_deal_value;
    return { replies, deals, revenue };
  }, [letterCount, prefs.reply_rate_pct, prefs.deal_rate_pct, prefs.avg_deal_value]);

  return (
    <CardV2 className={cn('overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => update({ collapsed: !collapsed })}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--surface-2))]"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <span className="font-display text-[14px] font-semibold tracking-tight text-[hsl(var(--text))]">
            {title}
          </span>
          {/* Свёрнутое состояние — показываем компактный итог справа от заголовка. */}
          {collapsed && letterCount > 0 && (
            <span className="ml-1 text-[12px] text-[hsl(var(--muted))]">
              ~{formatCount(result.deals)} сделок · {formatRub(result.revenue)}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[hsl(var(--muted))] transition-transform',
            !collapsed && 'rotate-180',
          )}
        />
      </button>

      {!collapsed && (
        <div className="space-y-4 border-t border-[hsl(var(--border))] px-4 py-4">
          {/* Слайдеры */}
          <SliderRow
            label="Reply rate"
            hint="Доля ответивших на cold-email. Cold B2B РФ: 1–3% — типично, 5%+ — топ."
            value={prefs.reply_rate_pct}
            min={0.5}
            max={5}
            step={0.1}
            unit="%"
            onChange={(v) => update({ reply_rate_pct: v })}
          />
          <SliderRow
            label="Конверсия в сделку"
            hint="Доля ответов, ставших договором (через звонок/встречу)."
            value={prefs.deal_rate_pct}
            min={1}
            max={40}
            step={1}
            unit="%"
            onChange={(v) => update({ deal_rate_pct: v })}
          />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12px] font-medium text-[hsl(var(--text))]">
                Средний чек
              </span>
              <span className="font-mono text-[12px] tabular-nums text-[hsl(var(--text))]">
                {formatRub(prefs.avg_deal_value)}
              </span>
            </div>
            <input
              type="number"
              min={1000}
              step={1000}
              value={prefs.avg_deal_value}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) update({ avg_deal_value: n });
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] tabular-nums focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Воронка-результат */}
          <div className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50 to-white px-3 py-3 dark:border-violet-800/40 dark:from-violet-950/30 dark:to-transparent">
            <FunnelLine
              label="Писем уйдёт"
              value={letterCount.toLocaleString('ru-RU')}
              dim
            />
            <FunnelLine
              label="Ожидаем ответов"
              value={`~${formatCount(result.replies)}`}
            />
            <FunnelLine
              label="Из них сделок"
              value={`~${formatCount(result.deals)}`}
            />
            <div className="mt-2 border-t border-violet-200 pt-2 dark:border-violet-800/40">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
                  Выручка
                </span>
                <span className="font-display text-[18px] font-semibold tabular-nums text-violet-700 dark:text-violet-300">
                  {formatRub(result.revenue)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
            Цифры — оценка, не гарантия. На реальный отклик влияют качество
            болей, корректность email-а у компании, спам-репутация домена,
            время суток отправки. Используй как ориентир для решения
            «сколько писать сегодня».
          </p>
        </div>
      )}
    </CardV2>
  );
}

interface SliderRowProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
}: SliderRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[hsl(var(--text))]">
          {label}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-[hsl(var(--text))]">
          {value.toFixed(step < 1 ? 1 : 0).replace('.', ',')}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-violet-100 accent-violet-600 dark:bg-violet-950/60"
        aria-label={label}
      />
      <p className="mt-1 text-[10.5px] leading-tight text-[hsl(var(--muted))]">
        {hint}
      </p>
    </div>
  );
}

interface FunnelLineProps {
  label: string;
  value: string;
  dim?: boolean;
}

function FunnelLine({ label, value, dim }: FunnelLineProps) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-0.5 text-[13px]',
        dim && 'text-[hsl(var(--muted))]',
      )}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
