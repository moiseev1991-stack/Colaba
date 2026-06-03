'use client';

import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { ButtonV2 } from './ui/ButtonV2';
import { SignalPill } from './ui/SignalPill';
import { cn } from '@/lib/utils';
import { CitySelector } from './CitySelector';

// §4.16 ТЗ редизайна 2026-06-03 (Phase C batch 4): SearchCard на v2-токены.
// Tab «SEO» теперь в брендовом таб-стиле (bg-brand-50/text-brand-700),
// «Скоро» плашки — SignalPill muted. Контейнер — на surface + v2-радиус.

interface SearchCardProps {
  city: string;
  onCityChange: (city: string) => void;
  onSubmit: (keyword: string, searchProvider: string) => void;
  activeModule?: 'seo' | 'contacts' | 'prices';
  onModuleChange?: (module: 'seo' | 'contacts' | 'prices') => void;
  isLoading?: boolean;
}

export function SearchCard({ city, onCityChange, onSubmit, activeModule = 'seo', onModuleChange, isLoading = false }: SearchCardProps) {
  const [keyword, setKeyword] = useState('');
  const [searchProvider, setSearchProvider] = useState('yandex_xml');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !city || activeModule !== 'seo' || isLoading) return;
    onSubmit(keyword.trim(), searchProvider);
  };

  const isDisabled = !keyword.trim() || !city || activeModule !== 'seo' || isLoading;

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[SearchCard] provider=%s query=%s city=%s isDisabled=%s', searchProvider, keyword.trim(), city, isDisabled);
    }
  }, [searchProvider, keyword, city, isDisabled]);

  return (
    <div
      className="rounded-v2-lg border shadow-v2-sm overflow-hidden"
      style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
    >
      {/* Tabs Header */}
      <div
        className="flex gap-2 px-4 pt-3 pb-0 flex-wrap"
        style={{ borderBottom: '1px solid hsl(var(--border))' }}
      >
        <button
          type="button"
          className={cn(
            'flex items-center h-8 px-2.5 rounded-v2-sm text-sm font-medium transition-colors',
            activeModule === 'seo'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
              : 'td-muted hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))]',
          )}
          onClick={() => onModuleChange?.('seo')}
        >
          SEO
        </button>
        <button
          type="button"
          className="flex items-center gap-2 h-8 px-2.5 rounded-v2-sm text-sm font-medium opacity-50 cursor-not-allowed td-muted"
          disabled
        >
          Контакты
          <SignalPill tone="muted" size="sm">Скоро</SignalPill>
        </button>
        <button
          type="button"
          className="flex items-center gap-2 h-8 px-2.5 rounded-v2-sm text-sm font-medium opacity-50 cursor-not-allowed td-muted"
          disabled
        >
          <span className="whitespace-nowrap">Мониторинг цен</span>
          <SignalPill tone="muted" size="sm">Скоро</SignalPill>
        </button>
      </div>

      {/* Search Form Content */}
      <div className="p-4 md:p-5">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: 'hsl(var(--text))' }}
              >
                Поисковая система:
              </span>
              <Select value={searchProvider} onChange={(e) => setSearchProvider(e.target.value)} disabled={isLoading} className="w-[200px] flex-shrink-0">
                <option value="yandex_xml">Яндекс XML (ключи)</option>
                <option value="yandex_html">Яндекс HTML (бесплатно)</option>
                <option value="google_html">Google HTML (бесплатно)</option>
                <option value="serpapi" disabled>SerpAPI (deprecated)</option>
              </Select>
            </div>
            <Input type="text" placeholder="Введите ключевое слово..." value={keyword} onChange={(e) => setKeyword(e.target.value)} disabled={isLoading} className="flex-1 min-w-[200px]" />
            <CitySelector
              city={city}
              onCityChange={onCityChange}
              disabled={isLoading}
              regionClassName="w-[200px] flex-shrink-0"
              cityClassName="w-[160px] flex-shrink-0"
            />
            <ButtonV2
              type="submit"
              variant="primary"
              size="md"
              disabled={isDisabled}
              loading={isLoading}
              className="flex-shrink-0"
            >
              Найти
            </ButtonV2>
          </div>
        </form>
      </div>
    </div>
  );
}
