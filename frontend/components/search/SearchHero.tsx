'use client';

import * as React from 'react';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchModeSwitch } from './SearchModeSwitch';

/**
 * Шапка трёх видов поиска (карты · сайты · по боли) — одна разметка, чтобы при
 * переключении ничего не прыгало. 18.09 (@user): вместо крупного лозунга — компактная строка
 * «Поиск» + переключатель режимов, объяснение режима — в подсказке «Как это работает».
 * Главный акцент — форма поиска сразу под шапкой. Ширина контента — SEARCH_CONTENT_WIDTH.
 */
export const SEARCH_CONTENT_WIDTH = 'w-full';

export function SearchHero({
  active,
  hintTitle,
  children,
}: {
  active: 'maps' | 'sites' | 'pains';
  /** Заголовок подсказки «Как это работает». */
  hintTitle: string;
  /** Текст подсказки: что делает режим и что получится на выходе. */
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        SEARCH_CONTENT_WIDTH,
        'relative flex flex-wrap items-center justify-between gap-3',
      )}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-ui-text">Поиск</h1>
        <SearchHint title={hintTitle}>{children}</SearchHint>
      </div>
      <SearchModeSwitch active={active} />
    </div>
  );
}

function SearchHint({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 py-1 text-small font-semibold transition-colors sm:min-h-0',
          open
            ? 'bg-ui-accent/10 text-ui-accent'
            : 'text-ui-text-muted hover:bg-ui-surface-2 hover:text-ui-text',
        )}
      >
        <Info className="h-4 w-4" aria-hidden />
        Как это работает
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className="absolute left-0 top-12 z-40 w-[min(360px,calc(100vw-32px))] rounded-card border border-black/[.06] bg-ui-surface p-4 text-left shadow-overlay"
        >
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <p className="text-small font-bold text-ui-text">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
              className="-mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded text-ui-text-muted hover:text-ui-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <div className="space-y-1.5 text-small leading-relaxed text-ui-text-muted">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
