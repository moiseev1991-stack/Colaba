'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

import { cn, pluralRu } from '@/lib/utils';

/**
 * Выпадающий список ниш (18.09, замечание @user на «По боли»): вид и поведение как у
 * CityCombobox — кнопка-поле, по клику список с поиском. Ниши — из базы с числом компаний
 * (/maps/insights/niches), крупные сверху. Первый пункт — «Все ниши» (пустое значение).
 * Если нужной ниши нет в списке, последний пункт ищет по введённому тексту — как было
 * у прежнего поля ввода.
 */
export interface NicheOption {
  niche: string;
  companies_count?: number;
}

interface NicheComboboxProps {
  niche: string;
  onNicheChange: (niche: string) => void;
  options: NicheOption[];
  loading?: boolean;
  id?: string;
  placeholder?: string;
  /** Подпись пункта с пустым значением. */
  allLabel?: string;
  className?: string;
}

const DROPDOWN_MAX_H = 340;

function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim();
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

type Row =
  { kind: 'all' } | { kind: 'niche'; option: NicheOption } | { kind: 'custom'; text: string };

export function NicheCombobox({
  niche,
  onNicheChange,
  options,
  loading = false,
  id,
  placeholder = 'Все ниши',
  allLabel = 'Все ниши',
  className,
}: NicheComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const q = normalize(query);
    const matched = q ? options.filter((o) => normalize(o.niche).includes(q)) : options;
    const out: Row[] = q ? [] : [{ kind: 'all' }];
    out.push(...matched.map((option) => ({ kind: 'niche' as const, option })));
    if (q && !options.some((o) => normalize(o.niche) === q)) {
      out.push({ kind: 'custom', text: query.trim() });
    }
    return out;
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const pick = useCallback(
    (row: Row) => {
      onNicheChange(row.kind === 'all' ? '' : row.kind === 'niche' ? row.option.niche : row.text);
      close();
      triggerRef.current?.focus();
    },
    [onNicheChange, close],
  );

  useEffect(() => setHighlighted(0), [query]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setOpenUpward(below < DROPDOWN_MAX_H && r.top > below);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[highlighted]) pick(rows[highlighted]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    }
  };

  const selectedCount = options.find((o) => o.niche === niche)?.companies_count;

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-control border px-3 text-left transition-all',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ui-accent/15',
          open
            ? 'border-ui-accent bg-ui-surface ring-4 ring-ui-accent/15'
            : 'border-transparent bg-ui-surface-2 hover:border-control-border-hover',
        )}
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          {niche ? (
            <>
              <span className="truncate text-sm font-semibold text-ui-text">
                {capitalize(niche)}
              </span>
              {typeof selectedCount === 'number' && (
                <span className="shrink-0 text-xs tabular-nums text-ui-text-muted">
                  {selectedCount.toLocaleString('ru-RU')}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-ui-text-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-ui-text-muted transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className={cn(
            'absolute inset-x-0 z-50 flex flex-col overflow-hidden rounded-card border border-black/[.06] bg-ui-surface shadow-overlay',
            openUpward ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]',
          )}
          style={{ maxHeight: DROPDOWN_MAX_H }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-ui-border bg-ui-surface-2/60 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-ui-accent" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Поиск ниши или своя"
              aria-label="Поиск ниши"
              className="min-w-0 flex-1 bg-transparent text-sm text-ui-text outline-none placeholder:text-ui-text-muted"
            />
            {query && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery('')}
                aria-label="Очистить поиск"
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-ui-text-muted hover:text-ui-text"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          <div
            ref={listRef}
            role="listbox"
            aria-label="Ниши"
            className="flex-1 overflow-y-auto py-1"
          >
            {loading && options.length === 0 && (
              <p className="px-4 py-3 text-small text-ui-text-muted">Загрузка ниш…</p>
            )}
            {rows.map((row, idx) => {
              const value =
                row.kind === 'all' ? '' : row.kind === 'niche' ? row.option.niche : row.text;
              const selected = row.kind !== 'custom' && value === niche;
              const isHi = idx === highlighted;
              return (
                <button
                  key={row.kind === 'niche' ? row.option.niche : row.kind}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-highlighted={isHi}
                  onMouseEnter={() => setHighlighted(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row)}
                  className={cn(
                    'flex w-full items-center gap-3 border-l-2 px-4 py-2 text-left text-sm transition-colors',
                    isHi ? 'bg-ui-accent/[.06]' : 'bg-transparent',
                    selected
                      ? 'border-ui-accent font-semibold text-ui-accent'
                      : 'border-transparent text-ui-text',
                  )}
                >
                  {row.kind === 'all' && <span className="flex-1">{allLabel}</span>}
                  {row.kind === 'niche' && (
                    <>
                      <span className="min-w-0 flex-1 truncate">
                        {capitalize(row.option.niche)}
                      </span>
                      {typeof row.option.companies_count === 'number' && (
                        <span className="shrink-0 text-xs tabular-nums text-ui-text-muted">
                          {row.option.companies_count.toLocaleString('ru-RU')}{' '}
                          {pluralRu(row.option.companies_count, [
                            'компания',
                            'компании',
                            'компаний',
                          ])}
                        </span>
                      )}
                    </>
                  )}
                  {row.kind === 'custom' && (
                    <span className="flex-1 text-ui-text-muted">
                      Искать по нише «<span className="font-semibold text-ui-text">{row.text}</span>
                      »
                    </span>
                  )}
                </button>
              );
            })}
            {!loading && rows.length === 0 && (
              <p className="px-4 py-3 text-small text-ui-text-muted">Ничего не найдено</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
