'use client';

/**
 * Аватарка компании для таблиц/drawer'ов (kp-jobs, при желании — и leads).
 *
 * Приоритет: logoUrl → инициалы. Инициалы — первые символы первых двух
 * слов имени, фон детерминирован hash'ем имени (одинаковый цвет на всех
 * страницах). Это не identicon, просто читаемая «иконка лида» в стиле
 * Pipedrive/Salesforce — на странице партии в 75 компаний нужен быстрый
 * визуальный якорь, по нему юзер опознаёт строку быстрее, чем по тексту.
 */

import { useState, type CSSProperties } from 'react';

import { cn } from '@/lib/utils';

interface CompanyAvatarProps {
  name: string | null;
  /** URL логотипа из maps.raw_data — http(s) либо null. */
  logoUrl?: string | null;
  /** Размер квадрата в px. Дефолт — 36 (под высоту строки таблицы). */
  size?: number;
  className?: string;
  /** Уменьшенный шрифт для compact-вариантов; auto = size * 0.4. */
  fontSize?: number;
}

// Палитра пастельных цветов — берётся детерминированно по hash(name).
// Все — мягкие, читаемые на белом, не конкурируют с brand'ом интерфейса.
const PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#FEE2E2', fg: '#B91C1C' }, // red-100/red-700
  { bg: '#FFEDD5', fg: '#C2410C' }, // orange-100/orange-700
  { bg: '#FEF3C7', fg: '#B45309' }, // amber-100/amber-700
  { bg: '#DCFCE7', fg: '#15803D' }, // green-100/green-700
  { bg: '#CFFAFE', fg: '#0E7490' }, // cyan-100/cyan-700
  { bg: '#DBEAFE', fg: '#1D4ED8' }, // blue-100/blue-700
  { bg: '#E0E7FF', fg: '#4338CA' }, // indigo-100/indigo-700
  { bg: '#F3E8FF', fg: '#7E22CE' }, // purple-100/purple-700
  { bg: '#FCE7F3', fg: '#BE185D' }, // pink-100/pink-700
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getInitials(name: string | null): string {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  const first = parts[0].slice(0, 1).toUpperCase();
  if (parts.length === 1) return first;
  const second = parts[1].slice(0, 1).toUpperCase();
  return first + second;
}

export function CompanyAvatar({
  name,
  logoUrl,
  size = 36,
  className,
  fontSize,
}: CompanyAvatarProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  const showLogo = Boolean(logoUrl) && !logoFailed;
  const initials = getInitials(name);
  const palette = PALETTE[hashString(name || '') % PALETTE.length];

  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: fontSize ?? Math.round(size * 0.4),
    background: showLogo ? '#fff' : palette.bg,
    color: palette.fg,
    borderColor: 'hsl(var(--border))',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full border overflow-hidden shrink-0 font-semibold select-none',
        className,
      )}
      style={style}
      aria-label={name || 'компания'}
      title={name || undefined}
    >
      {showLogo ? (
        // Внешний URL — next/image без сконфигурированного домена даст 400,
        // а здесь логотипы хостятся 2GIS/Yandex (десятки разных доменов).
        // Чистая <img/> с onError → fallback на инициалы.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl!}
          alt=""
          width={size}
          height={size}
          onError={() => setLogoFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
