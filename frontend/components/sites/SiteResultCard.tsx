'use client';

/**
 * Карточка одного результата web-поиска на вкладке «Сайты»
 * (Эпик F фокус-релиза «КП-конвейер»).
 *
 * Показывает: domain, title, url, snippet (с подсветкой entry). Действие:
 * кнопка «КП» — POST /outreach/site-leads чтобы материализовать SiteLead,
 * потом передаёт id наверх для открытия KpModal.
 *
 * Карточка нейтральная (Pipedrive-flat), без сильных бренд-цветов.
 */

import { ExternalLink, Globe, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

import {
  createSiteLead,
  type SiteLead,
} from '@/src/services/api/outreach-site-leads';
import type { WebSearchResult } from '@/src/services/api/web-searches';

interface Props {
  result: WebSearchResult;
  /** Что ищется (entry для SiteLead). */
  entry: string;
  /** Запрос юзера (query для SiteLead). */
  query: string;
  /** Поднимается наверх когда юзер кликает КП и SiteLead создан/найден. */
  onKpForLead: (lead: SiteLead) => void;
}

function highlight(snippet: string | null, entry: string): React.ReactNode {
  if (!snippet) return null;
  if (!entry) return snippet;
  const re = new RegExp(
    `(${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi',
  );
  const parts = snippet.split(re);
  return parts.map((p, i) =>
    re.test(p) ? (
      <mark
        key={i}
        className="rounded bg-amber-200 px-0.5 text-amber-900 dark:bg-amber-500/40 dark:text-amber-100"
      >
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function SiteResultCard({ result, entry, query, onKpForLead }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleKp() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const lead = await createSiteLead({
        query,
        entry,
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        search_id: result.search_id,
      });
      onKpForLead(lead);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить лид');
    } finally {
      setLoading(false);
    }
  }

  const domain = result.domain || (() => {
    try {
      return new URL(result.url).hostname.replace(/^www\./, '');
    } catch {
      return result.url;
    }
  })();

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
            <Globe className="h-3.5 w-3.5" />
            <span className="truncate">{domain}</span>
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate text-[15px] font-semibold text-slate-900 hover:underline dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {result.title || domain}
          </a>
          {result.snippet && (
            <p className="mt-1 text-[13px] leading-snug text-slate-700 dark:text-slate-300">
              {highlight(result.snippet, entry)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11.5px] font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Открыть сайт"
          >
            <ExternalLink className="h-3 w-3" />
            Открыть
          </a>
          <button
            type="button"
            onClick={handleKp}
            disabled={loading}
            title="Сгенерировать КП по этому сайту"
            className="inline-flex h-9 items-center gap-1.5 rounded bg-violet-600 px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-600"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            КП
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-200">
          {error}
        </div>
      )}
    </li>
  );
}
