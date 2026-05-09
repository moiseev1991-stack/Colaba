'use client';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type KeyboardEvent,
} from 'react';
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

const DROPDOWN_MAX_H = 340;

/** Нормализует строку для поиска: нижний регистр, без ё/диакритики */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
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
  const [openUpward, setOpenUpward] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Фильтрация
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

  // Region label for the secondary line in the trigger
  const region = useMemo(() => {
    if (!city) return null;
    for (const r of REGIONS) {
      if (r.cities.includes(city)) return r;
    }
    return null;
  }, [city]);

  // Сброс подсветки при смене запроса
  useEffect(() => {
    setHighlightedIdx(0);
  }, [query]);

  // Решение, открывать дропдаун вверх или вниз — по доступному месту в viewport
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    setOpenUpward(spaceBelow < DROPDOWN_MAX_H && r.top > spaceBelow);
  }, [open]);

  // Фокус на поиске при открытии
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  // Скролл к выделенному элементу
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx]);

  // Закрытие по клику вне
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setQuery('');
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Закрытие по Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const selectCity = useCallback(
    (option: CityOption) => {
      onCityChange(option.city, option.yandexId);
      setOpen(false);
      setQuery('');
    },
    [onCityChange]
  );

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
      }
    },
    [flatList, highlightedIdx, selectCity]
  );

  function highlight(text: string): React.ReactNode {
    if (!query.trim()) return text;
    const q = normalize(query.trim());
    const lower = normalize(text);
    const idx = lower.indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark
          style={{
            background: 'hsl(var(--accent) / 0.3)',
            color: 'inherit',
            padding: 0,
            borderRadius: 2,
          }}
        >
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        className={cn(
          'flex items-center justify-between gap-2 h-11 w-full px-3 transition-all',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        style={{
          background: 'hsl(var(--surface))',
          border: `1px solid ${open ? 'hsl(var(--accent))' : 'hsl(var(--border))'}`,
          borderRadius: 4,
          color: 'hsl(var(--text))',
          boxShadow: open ? '0 0 0 3px hsl(var(--accent) / 0.18)' : undefined,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {city ? (
            <>
              <span
                className="text-[14px] font-semibold truncate"
                style={{ color: 'hsl(var(--text))' }}
              >
                {city}
              </span>
              {region && region.name !== city && (
                <span
                  className="app-bracket-tag truncate"
                  style={{ color: 'hsl(var(--muted))' }}
                  title={region.name}
                >
                  {region.name}
                </span>
              )}
            </>
          ) : (
            <span className="text-[14px]" style={{ color: 'hsl(var(--muted))' }}>
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 transition-transform duration-150',
            open && 'rotate-180',
          )}
          style={{ color: 'hsl(var(--muted))' }}
        />
      </button>

      {/* Dropdown — absolute, anchored to trigger. No portal needed. */}
      {open && (
        <div
          className="absolute left-0 right-0 z-50 flex flex-col"
          style={{
            top: openUpward ? undefined : 'calc(100% + 4px)',
            bottom: openUpward ? 'calc(100% + 4px)' : undefined,
            maxHeight: DROPDOWN_MAX_H,
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 6,
            boxShadow:
              '0 14px 40px -10px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          {/* Search bar */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
            style={{
              borderBottom: '1px solid hsl(var(--border))',
              background: 'hsl(var(--surface-2) / 0.6)',
            }}
          >
            <Search
              className="h-4 w-4 flex-shrink-0"
              style={{ color: 'hsl(var(--accent))' }}
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Поиск города или региона…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
              style={{ color: 'hsl(var(--text))' }}
            />
            {query && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery('')}
                className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5"
                style={{ color: 'hsl(var(--muted))', borderRadius: 3 }}
                aria-label="Очистить"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* List */}
          <div ref={listRef} className="overflow-y-auto flex-1" role="listbox">
            {(() => {
              let globalIdx = 0;
              return filteredGroups.length === 0 ? (
                <p
                  className="py-6 text-center text-sm"
                  style={{ color: 'hsl(var(--muted))' }}
                >
                  Ничего не найдено
                </p>
              ) : (
                filteredGroups.map((group) => (
                  <div key={group.regionId}>
                    <div
                      className="px-4 pt-2.5 pb-1 select-none app-mono-label flex items-center justify-between"
                      style={{
                        color: 'hsl(var(--muted))',
                        background: 'hsl(var(--surface-2) / 0.3)',
                      }}
                    >
                      <span>{group.regionName}</span>
                      <span style={{ opacity: 0.5 }}>{group.cities.length}</span>
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
                          className="w-full text-left px-4 py-2 text-[14px] flex items-center gap-2.5 transition-colors"
                          style={{
                            color:
                              isHighlighted || isSelected
                                ? 'hsl(var(--accent))'
                                : 'hsl(var(--text))',
                            background: isHighlighted
                              ? 'hsl(var(--accent-weak))'
                              : 'transparent',
                            fontWeight: isSelected ? 700 : 500,
                            borderLeft: isSelected
                              ? '2px solid hsl(var(--accent))'
                              : '2px solid transparent',
                          }}
                        >
                          <span
                            className="flex-shrink-0 inline-block"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 1,
                              background: isSelected
                                ? 'hsl(var(--accent))'
                                : 'transparent',
                              border: isSelected
                                ? 'none'
                                : '1px solid hsl(var(--border))',
                            }}
                          />
                          <span className="flex-1">{highlight(option.city)}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
