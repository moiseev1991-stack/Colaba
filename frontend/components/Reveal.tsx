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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
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

  const animStyle: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translate3d(0,0,0)' : `translate3d(0, ${offsetY}px, 0)`,
    transition: `opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1) ${delayMs}ms, transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1) ${delayMs}ms`,
    willChange: 'opacity, transform',
  };

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
