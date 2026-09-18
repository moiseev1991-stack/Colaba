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
  reply_rate_pct: number; // 0.5–5
  deal_rate_pct: number; // 5–35
  avg_deal_value: number; // ₽
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
      avg_deal_value: clampNumber(
        parsed.avg_deal_value,
        1_000,
        10_000_000,
        DEFAULTS.avg_deal_value,
      ),
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
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-ui-surface-2"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-ui-accent" />
          <span className="font-display text-sm font-semibold tracking-tight text-ui-text">
            {title}
          </span>
          {/* Свёрнутое состояние — показываем компактный итог справа от заголовка. */}
          {collapsed && letterCount > 0 && (
            <span className="ml-1 text-xs text-ui-text-muted">
              ~{formatCount(result.deals)} сделок · {formatRub(result.revenue)}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-ui-text-muted transition-transform',
            !collapsed && 'rotate-180',
          )}
        />
      </button>

      {!collapsed && (
        <div className="space-y-4 border-t border-ui-border px-4 py-4">
          {/* Слайдеры */}
          <SliderRow
            label="Доля ответов"
            hint="Кто ответит на холодное письмо. Cold B2B в РФ: 1–3% — типично, 5%+ — топ."
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
              <span className="text-xs font-medium text-ui-text">Средний чек</span>
              <span className="text-xs tabular-nums text-ui-text">
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
              className="w-full rounded-control border border-ui-border bg-ui-surface px-2.5 py-1.5 text-small tabular-nums text-ui-text focus:border-ui-accent focus:outline-none focus:ring-4 focus:ring-ui-accent/15"
            />
          </div>

          {/* Воронка-результат */}
          <div className="rounded-control border border-ui-accent/25 bg-ui-accent/[.05] px-3 py-3">
            <FunnelLine label="Писем уйдёт" value={letterCount.toLocaleString('ru-RU')} dim />
            <FunnelLine label="Ожидаем ответов" value={`~${formatCount(result.replies)}`} />
            <FunnelLine label="Из них сделок" value={`~${formatCount(result.deals)}`} />
            <div className="mt-2 border-t border-ui-accent/35 pt-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-ui-text-muted">
                  Выручка
                </span>
                <span className="font-display text-xl font-semibold tabular-nums text-ui-accent">
                  {formatRub(result.revenue)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-ui-text-muted">
            Цифры — оценка, не гарантия. На реальный отклик влияют качество болей, корректность
            email-а у компании, спам-репутация домена, время суток отправки. Используй как ориентир
            для решения «сколько писать сегодня».
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

function SliderRow({ label, hint, value, min, max, step, unit = '', onChange }: SliderRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ui-text">{label}</span>
        <span className="text-xs tabular-nums text-ui-text">
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
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ui-accent/10 accent-[hsl(var(--color-accent))]"
        aria-label={label}
      />
      <p className="mt-1 text-xs leading-tight text-ui-text-muted">{hint}</p>
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
        'flex items-baseline justify-between gap-2 py-0.5 text-small',
        dim && 'text-ui-text-muted',
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
