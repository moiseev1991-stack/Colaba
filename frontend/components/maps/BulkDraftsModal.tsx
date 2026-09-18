'use client';

/**
 * Модал bulk-генерации драфтов для всех компаний списка лидов.
 *
 * Один клик → параллельные LLM-вызовы → таблица с темой / телом / контактом
 * по каждой компании. Юзер может скопировать каждый или открыть в почтовом
 * клиенте через mailto:.
 *
 * Генерация может занять 10-30 секунд на 25 компаний — показываем прогресс.
 */

import { useEffect, useState } from 'react';
import { pluralRu } from '@/lib/utils';
import { Copy, Mail, MessageSquareQuote, Sparkles, X } from 'lucide-react';

import { bulkDraftEmails, type BulkDraftsOut } from '@/src/services/api/leadLists';

interface Props {
  open: boolean;
  listId: number;
  listName: string;
  itemsCount: number;
  onClose: () => void;
}

export function BulkDraftsModal({ open, listId, listName, itemsCount, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkDraftsOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  async function startBulk() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const out = await bulkDraftEmails(listId);
      setResult(out);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Не удалось подготовить черновики';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-ui-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-ui-border px-5 py-3">
          <h3 className="text-sm font-semibold text-ui-text">
            Черновики писем для «{listName}»
            <span className="ml-2 text-xs font-normal text-ui-text-muted">
              ({itemsCount} {pluralRu(itemsCount, ['компания', 'компании', 'компаний'])})
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-md p-1 text-ui-text-muted hover:bg-ui-surface-2 hover:text-ui-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!result && !loading && !error && (
            <div className="space-y-3">
              <p className="text-sm text-ui-text-muted">
                Подготовим черновик холодного письма для каждой компании списка, у которой есть
                AI-боли клиентов с цитатами. LLM работает параллельно — обычно занимает 10-30 секунд
                на 25 компаний.
              </p>
              <p className="text-xs text-ui-text-muted">
                Компании без болей с цитатами будут пропущены. Это норма — для них надо сначала
                прогнать AI-анализ отзывов.
              </p>
              <button
                onClick={startBulk}
                className="inline-flex items-center gap-1.5 rounded-full bg-ui-accent px-3 py-2 text-sm font-medium text-white hover:bg-ui-accent-hover"
              >
                <Sparkles className="h-4 w-4" />
                Подготовить черновики: {itemsCount}{' '}
                {pluralRu(itemsCount, ['компания', 'компании', 'компаний'])}
              </button>
            </div>
          )}

          {loading && (
            <div className="space-y-3 py-6">
              <div className="flex items-center gap-2">
                <div className="h-2 w-48 overflow-hidden rounded-full bg-ui-border">
                  <div className="h-full w-1/3 animate-pulse bg-ui-accent" />
                </div>
                <span className="text-sm text-ui-text-muted">
                  Готовим черновики: {itemsCount}{' '}
                  {pluralRu(itemsCount, ['компания', 'компании', 'компаний'])}…
                </span>
              </div>
              <p className="text-xs text-ui-text-muted">
                Параллельные LLM-вызовы через ProxyAPI. Обычно 10-30 секунд.
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-v2-sm border border-[color:var(--signal-hot)]/30 bg-[var(--signal-hot-bg)] px-3 py-2 text-sm text-[color:var(--signal-hot)]">
              {error}
            </div>
          )}

          {result && !loading && (
            <div className="space-y-3">
              <div className="rounded-v2-sm border border-[color:var(--signal-good)]/30 bg-[var(--signal-good-bg)] px-3 py-2 text-sm text-[color:var(--signal-good)]">
                <div className="font-medium">
                  Готово: {result.drafts.length} драфт
                  {result.drafts.length === 1 ? '' : result.drafts.length < 5 ? 'а' : 'ов'} из{' '}
                  {result.total_companies} компаний
                </div>
                {(result.skipped_no_pains > 0 || result.skipped_llm_error > 0) && (
                  <div className="mt-1 text-xs text-[color:var(--signal-good)]/80">
                    Пропущено: {result.skipped_no_pains} без болей, {result.skipped_llm_error} с
                    ошибкой LLM.
                  </div>
                )}
              </div>

              <ul className="space-y-3">
                {result.drafts.map((d, i) => (
                  <li
                    key={d.company_id}
                    className="rounded-md border border-ui-border bg-ui-surface p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ui-text">
                          {i + 1}. {d.company_name}
                        </div>
                        {d.suggested_to_emails.length > 0 && (
                          <div className="mt-0.5 text-xs text-ui-text-muted">
                            → {d.suggested_to_emails.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => copy(`${d.subject}\n\n${d.body}`, `all-${d.company_id}`)}
                          className="inline-flex items-center gap-1 rounded-md border border-ui-border bg-ui-surface px-2 py-1 text-xs font-medium text-ui-text hover:bg-ui-surface-2"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedKey === `all-${d.company_id}` ? 'скопировано' : 'копировать'}
                        </button>
                        {d.suggested_to_emails.length > 0 && (
                          <a
                            href={`mailto:${d.suggested_to_emails[0]}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`}
                            className="inline-flex items-center gap-1 rounded-full bg-ui-accent px-2 py-1 text-xs font-medium text-white hover:bg-ui-accent-hover"
                          >
                            <Mail className="h-3 w-3" />
                            почта
                          </a>
                        )}
                      </div>
                    </div>

                    {d.used_pain_label && (
                      <div className="mt-2 rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-2 py-1.5">
                        <div className="text-xs font-medium text-[color:var(--signal-warm)]">
                          использована боль: {d.used_pain_label}
                        </div>
                        {d.used_pain_quote && (
                          <div className="mt-0.5 flex items-start gap-1 text-xs text-ui-text">
                            <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--signal-warm)]" />
                            <span className="italic">«{d.used_pain_quote}»</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-2 text-xs">
                      <div className="font-medium text-ui-text">Тема:</div>
                      <div className="rounded bg-ui-surface-2 px-2 py-1 text-ui-text">
                        {d.subject}
                      </div>
                    </div>
                    <div className="mt-2 text-xs">
                      <div className="font-medium text-ui-text">Текст:</div>
                      <pre className="whitespace-pre-wrap rounded bg-ui-surface-2 px-2 py-1 font-sans text-ui-text">
                        {d.body}
                      </pre>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ui-border bg-ui-surface-2 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-ui-border bg-ui-surface px-3 py-1.5 text-sm font-medium text-ui-text hover:bg-ui-surface-2"
          >
            Закрыть
          </button>
          {result && !loading && (
            <button
              onClick={startBulk}
              className="inline-flex items-center gap-1.5 rounded-full bg-ui-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-ui-accent-hover"
            >
              <Sparkles className="h-4 w-4" />
              Перегенерировать
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
