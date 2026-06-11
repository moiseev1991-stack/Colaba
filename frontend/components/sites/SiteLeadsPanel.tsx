'use client';

/**
 * Вкладка «Сайты» — поиск по веб-сайтам с вхождениями + КП по найденным
 * (Эпик F фокус-релиза «КП-конвейер», ТЗ 2026-06-12).
 *
 * Поток:
 *   1. Юзер вводит вхождение («© 2021», «Joomla», свой запрос) или
 *      кликает один из 4 chip-пресетов.
 *   2. POST /searches с query=entry, poll GET /searches/{id} до
 *      status=completed.
 *   3. GET /searches/{id}/results — рисуем карточки SiteResultCard.
 *   4. Клик «КП» на карточке → POST /outreach/site-leads (создаёт SiteLead) →
 *      открываем KpModal с siteLeadId.
 *
 * KpModal та же что в maps — поддерживает оба варианта (companyId/siteLeadId).
 */

import {
  ArrowRight,
  Globe,
  Loader2,
  Search as SearchIcon,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { KpModal } from '@/components/maps/KpModal';
import { SITE_ENTRY_PRESETS, type SiteEntryPreset } from '@/components/sites/siteEntryPresets';
import { SiteResultCard } from '@/components/sites/SiteResultCard';
import { cn } from '@/lib/utils';
import type { SiteLead } from '@/src/services/api/outreach-site-leads';
import {
  createWebSearch,
  getWebSearch,
  getWebSearchResults,
  type WebSearchOut,
  type WebSearchResult,
} from '@/src/services/api/web-searches';

type Status = 'idle' | 'searching' | 'ready' | 'error';

export function SiteLeadsPanel() {
  const [entry, setEntry] = useState('');
  const [activePresetIdx, setActivePresetIdx] = useState<number | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState<WebSearchOut | null>(null);
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // KpModal state — какой SiteLead открыт.
  const [kpSiteLead, setKpSiteLead] = useState<SiteLead | null>(null);
  // Какой template_key подсветить по умолчанию (от пресета, под который ищем).
  const [kpDefaultTemplateKey, setKpDefaultTemplateKey] = useState<string | undefined>(
    undefined,
  );

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  async function handlePreset(preset: SiteEntryPreset, idx: number) {
    setEntry(preset.query);
    setActivePresetIdx(idx);
    setKpDefaultTemplateKey(preset.kpTemplateKey);
    await runSearch(preset.query);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = entry.trim();
    if (!trimmed) return;
    setActivePresetIdx(
      SITE_ENTRY_PRESETS.findIndex((p) => p.query === trimmed),
    );
    await runSearch(trimmed);
  }

  async function runSearch(query: string) {
    stopPolling();
    setStatus('searching');
    setErrorMsg(null);
    setSearch(null);
    setResults([]);

    try {
      const s = await createWebSearch({ query });
      setSearch(s);
      // Poll каждые 2с до terminal-статуса. Не делаем SSE — modules/searches
      // его не отдаёт, а для одной вкладки polling экономически дешевле.
      pollTimer.current = setInterval(async () => {
        try {
          const latest = await getWebSearch(s.id);
          setSearch(latest);
          if (latest.status === 'completed') {
            stopPolling();
            const items = await getWebSearchResults(s.id);
            setResults(items);
            setStatus('ready');
          } else if (latest.status === 'failed') {
            stopPolling();
            setStatus('error');
            setErrorMsg('Поисковая система вернула ошибку. Попробуй другой запрос.');
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message;
      setErrorMsg(
        typeof detail === 'string'
          ? detail
          : 'Не удалось запустить поиск. Проверь подключение и попробуй снова.',
      );
      setStatus('error');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100">
          <Globe className="h-5 w-5 text-violet-600" />
          Поиск по сайтам с вхождением
        </h2>
        <p className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-400">
          Найдём сайты, где встречается заданное вхождение (например
          «© 2021» — заброшенные сайты, готовые лиды для веб-студии).
          На карточке результата — кнопка «КП», открывает модалку с
          сгенерированным письмом.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={entry}
            onChange={(e) => {
              setEntry(e.target.value);
              setActivePresetIdx(null);
              setKpDefaultTemplateKey(undefined);
            }}
            placeholder="Например: © 2021"
            className="w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Готовые сценарии
          </span>
          {SITE_ENTRY_PRESETS.map((p, idx) => {
            const active = activePresetIdx === idx;
            return (
              <button
                key={p.query}
                type="button"
                onClick={() => void handlePreset(p, idx)}
                title={p.hint}
                disabled={status === 'searching'}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active
                    ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-violet-900/30 dark:hover:text-violet-200',
                )}
              >
                <Sparkles className="h-3 w-3" />
                {p.label}
              </button>
            );
          })}
        </div>

        <div>
          <button
            type="submit"
            disabled={status === 'searching' || !entry.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'searching' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Найти
          </button>
        </div>
      </form>

      {/* Status / results */}
      {status === 'searching' && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
          Ищу сайты с «{entry}»…{' '}
          {search && (
            <span className="text-slate-500 dark:text-slate-400">
              · статус: {search.status}, найдено: {search.result_count}
            </span>
          )}
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="text-[12px] text-slate-500 dark:text-slate-400">
            Найдено {results.length} сайтов с «{entry}»
          </div>
          {results.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              По этому запросу ничего не нашлось. Попробуй другой вариант.
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <SiteResultCard
                  key={r.id}
                  result={r}
                  entry={entry}
                  query={entry}
                  onKpForLead={(lead) => setKpSiteLead(lead)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <KpModal
        open={kpSiteLead != null}
        siteLeadId={kpSiteLead?.id ?? null}
        companyName={kpSiteLead?.domain}
        defaultTemplateKey={kpDefaultTemplateKey}
        onClose={() => setKpSiteLead(null)}
      />
    </div>
  );
}
