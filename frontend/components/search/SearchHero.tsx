import * as React from 'react';
import { cn } from '@/lib/utils';
import { SearchModeSwitch } from './SearchModeSwitch';

/**
 * Первый экран трёх видов поиска (карты · сайты · по боли) — одна разметка, чтобы при
 * переключении ничего не прыгало (17.09): пилюля, заголовок в две строки, подзаголовок
 * фиксированной высоты и переключатель режимов на одном и том же месте.
 * Ширина контента под ним — SEARCH_CONTENT_WIDTH.
 */
export const SEARCH_CONTENT_WIDTH = 'mx-auto w-full max-w-[880px]';

export function SearchHero({
  active,
  eyebrow,
  title,
  dim,
  children,
}: {
  active: 'maps' | 'sites' | 'pains';
  eyebrow: string;
  title: string;
  dim: string;
  /** Подзаголовок — не длиннее двух строк на десктопе. */
  children: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <p className="mx-auto mb-6 inline-flex max-w-full items-center rounded-full border border-ui-accent/15 bg-ui-accent/[.06] px-4 py-1 text-small font-semibold text-ui-text-muted">
        <span className="truncate">{eyebrow}</span>
      </p>
      {/* Высота заголовка и подзаголовка закреплена: разная длина текста не сдвигает переключатель. */}
      <h1 className="mx-auto flex min-h-[4.24em] max-w-[900px] flex-col justify-center text-hero font-extrabold text-ui-text [text-wrap:balance] sm:min-h-[2.12em]">
        <span>{title}</span>
        <span className="font-bold text-ui-text-muted/75">{dim}</span>
      </h1>
      <p
        className={cn(
          'mx-auto mt-5 max-w-[62ch] text-base leading-relaxed text-ui-text-muted [text-wrap:balance]',
          'min-h-[6.5em] sm:min-h-[3.25em]',
        )}
      >
        {children}
      </p>
      <SearchModeSwitch active={active} className="mt-8" />
    </div>
  );
}
