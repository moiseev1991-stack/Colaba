import { BrandIcon } from '@/components/BrandLogo';

/**
 * Значок SpinLid. С 18.09 — «SL» на тёмной плитке (логотип №15, components/BrandLogo.tsx);
 * спираль снята. Пропсы прежние, чтобы не ломать вызовы: gradient / spiralColor / glow
 * больше ни на что не влияют.
 */
interface BrandMarkProps {
  size?: number;
  /** false — без плитки не бывает: знак и есть плитка, флаг оставлен для совместимости. */
  bg?: boolean;
  className?: string;
  /** Устарело (18.09). */
  gradient?: string;
  /** Устарело (18.09). */
  spiralColor?: string;
  /** Устарело (18.09). */
  glow?: string;
}

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  return <BrandIcon size={size} className={className} />;
}
