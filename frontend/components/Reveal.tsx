'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Задержка появления (мс). Полезно для каскадного появления соседей. */
  delayMs?: number;
  /** Сдвиг по Y до появления (px). По умолчанию 16. */
  offsetY?: number;
  /** Кастомный CSS-класс на обёртке. */
  className?: string;
  /** Inline-стили на обёртке (мерджатся поверх анимации). */
  style?: CSSProperties;
  /** Доля видимости, при которой триггерится (0..1). По умолчанию 0.15. */
  threshold?: number;
  /** Тег обёртки. */
  as?: keyof JSX.IntrinsicElements;
}

// 'initial' — серверный рендер и первый клиентский: контент виден (и без JS).
// 'hidden'  — после гидрации, только для блоков ниже экрана: ждём скролла.
// 'visible' — показан.
type Phase = 'initial' | 'hidden' | 'visible';

export function Reveal({
  children,
  delayMs = 0,
  offsetY = 16,
  className,
  style,
  threshold = 0.15,
  as: Tag = 'div',
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState<Phase>('initial');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onScreen = el.getBoundingClientRect().top < window.innerHeight;
    if (prefersReduced || onScreen || typeof IntersectionObserver === 'undefined') {
      setPhase('visible');
      return;
    }

    setPhase('hidden');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setPhase('visible');
            io.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  const transition = `opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1) ${delayMs}ms, transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1) ${delayMs}ms`;
  const animStyle: CSSProperties =
    phase === 'hidden'
      ? { opacity: 0, transform: `translate3d(0, ${offsetY}px, 0)`, transition, willChange: 'opacity, transform' }
      : phase === 'visible'
        ? { opacity: 1, transform: 'translate3d(0,0,0)', transition }
        : {};

  const Component = Tag as 'div';
  return (
    <Component
      ref={ref as React.MutableRefObject<HTMLDivElement | null>}
      className={className}
      style={{ ...animStyle, ...style }}
    >
      {children}
    </Component>
  );
}
