'use client';

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REGIONS, type CityOption } from '@/lib/cities';

interface CityComboboxProps {
  city: string;
  onCityChange: (city: string, yandexId: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

const DROPDOWN_W = 288;   // w-72 = 18rem = 288px
const DROPDOWN_MAX_H = 340;

/** Нормализует строку для поиска: нижний регистр, без ё/диакритики */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function CityCombobox({
  city,
  onCityChange,
  disabled = false,
  className,
  placeholder = 'Выберите город',
}: CityComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [pos, setPos] = useState<DropdownPos>({ top: 0, left: 0, width: DROPDOWN_W, openUpward: false });
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Portal requires document — only available client-side
  useEffect(() => { setMounted(true); }, []);

  // ── Фильтрация ────────────────────────────────────────────────────────────
  const { filteredGroups, flatList } = useMemo(() => {
    const q = normalize(query.trim());
    const groups: { regionId: string; regionName: string; cities: CityOption[] }[] = [];
    const flat: CityOption[] = [];

    for (const region of REGIONS) {
      const matched = q
        ? region.cities.filter((c) => normalize(c).includes(q))
        : region.cities;
      if (matched.length === 0) continue;

      const options: CityOption[] = matched.map((c) => ({
        city: c,
        regionId: region.id,
        regionName: region.name,
        yandexId: region.yandexId,
      }));
      groups.push({ regionId: region.id, regionName: region.name, cities: options });
      flat.push(...options);
    }
    return { filteredGroups: groups, flatList: flat };
  }, [query]);

  // ── Сброс подсветки при смене запроса ─────────────────────────────────────
  useEffect(() => { setHighlightedIdx(0); }, [query]);

  // ── Пересчёт позиции дропдауна ────────────────────────────────────────────
  // position:fixed → координаты уже относительно вьюпорта, scrollY не нужен
  const recalcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUpward = spaceBelow < DROPDOWN_MAX_H && r.top > spaceBelow;
    setPos({
      top: openUpward ? r.top - DROPDOWN_MAX_H - 4 : r.bottom + 4,
      left: r.left,
      width: Math.max(DROPDOWN_W, r.width),
      openUpward,
    });
  }, []);

  // Пересчёт при открытии, скролле и ресайзе
  useLayoutEffect(() => {
    if (!open) return;
    recalcPos();
    window.addEventListener('scroll', recalcPos, true);
    window.addEventListener('resize', recalcPos);
    return () => {
      window.removeEventListener('scroll', recalcPos, true);
      window.removeEventListener('resize', recalcPos);
    };
  }, [open, recalcPos]);

  // ── Фокус на поиске при открытии ─────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  // ── Скролл к выделенному элементу ────────────────────────────────────────
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx]);

  // ── Закрытие по клику вне ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        portalRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
      setQuery('');
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Выбор города ─────────────────────────────────────────────────────────
  const selectCity = useCallback(
    (option: CityOption) => {
      onCityChange(option.city, option.yandexId);
      setOpen(false);
      setQuery('');
    },
    [onCityChange]
  );

  // ── Клавиатурная навигация ────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatList[highlightedIdx]) selectCity(flatList[highlightedIdx]);
      } else if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    },
    [flatList, highlightedIdx, selectCity]
  );

  // ── Подсветка совпадения ──────────────────────────────────────────────────
  function highlight(text: string): React.ReactNode {
    if (!query.trim()) return text;
    const q = normalize(query.trim());
    const lower = normalize(text);
    const idx = lower.indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-700 text-inherit rounded-sm">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  // ── Дропдаун (рендерится в portal) ───────────────────────────────────────
  const dropdown = (
    <div
      ref={portalRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: DROPDOWN_MAX_H,
        zIndex: 9999,
      }}
      className={cn(
        'rounded-[12px] border border-control-border',
        'bg-white dark:bg-gray-800 shadow-xl',
        'flex flex-col overflow-hidden',
        pos.openUpward && 'flex-col-reverse'
      )}
    >
      {/* Строка поиска */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-control-border bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
        <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск города..."
          className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery('')}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Список */}
      <div ref={listRef} className="overflow-y-auto flex-1" role="listbox">
        {(() => {
          let globalIdx = 0;
          return filteredGroups.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              Ничего не найдено
            </p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.regionId}>
                <div className="px-3 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 select-none">
                  {group.regionName}
                </div>
                {group.cities.map((option) => {
                  const idx = globalIdx++;
                  const isHighlighted = idx === highlightedIdx;
                  const isSelected = option.city === city;
                  return (
                    <button
                      key={`${group.regionId}-${option.city}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-highlighted={isHighlighted}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectCity(option)}
                      className={cn(
                        'w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 transition-colors',
                        isHighlighted
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                        isSelected && !isHighlighted && 'font-medium text-blue-600 dark:text-blue-400'
                      )}
                    >
                      {isSelected ? (
                        <span className="text-blue-500 flex-shrink-0 text-xs">●</span>
                      ) : (
                        <span className="w-3 flex-shrink-0" />
                      )}
                      <span>{highlight(option.city)}</span>
                    </button>
                  );
                })}
              </div>
            ))
          );
        })()}
      </div>
    </div>
  );

  return (
    <div className={cn('relative inline-block', className)}>
      {/* Кнопка-триггер */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        className={cn(
          'flex items-center justify-between gap-2 h-9 w-full min-w-[200px] rounded-[10px]',
          'border border-control-border bg-gray-100 dark:bg-gray-700',
          'px-3 text-sm text-gray-900 dark:text-white',
          'hover:border-control-border-hover hover:bg-gray-200 dark:hover:bg-gray-600',
          'focus:outline-none focus:border-control-border-focus focus:ring-[3px] focus:ring-focus-ring focus:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-control-border-focus ring-[3px] ring-focus-ring ring-offset-0'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate', !city && 'text-gray-400 dark:text-gray-500')}>
          {city || placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Дропдаун через портал — вне любого overflow-контейнера */}
      {open && mounted && createPortal(dropdown, document.body)}
    </div>
  );
}
