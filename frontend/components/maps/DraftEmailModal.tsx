'use client';

/**
 * Модал «Драфт письма».
 *
 * Берёт результат POST /maps/companies/{id}/draft-email и показывает
 * subject + body + список использованных болей + suggested emails. Юзер может
 * скопировать тело письма или скачать .eml — но это не финальная отправка,
 * её делает существующий outreach-UI после сохранения в list.
 */

import { Copy, Mail, X, MessageSquareQuote } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { OutreachDraftOut } from '@/src/services/api/maps';

interface Props {
  open: boolean;
  draft: OutreachDraftOut | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
}

export function DraftEmailModal({ open, draft, loading, error, onClose }: Props) {
  const [copied, setCopied] = useState<null | 'subject' | 'body' | 'both'>(null);

  useEffect(() => {
    if (!open) setCopied(null);
  }, [open]);

  if (!open) return null;

  async function copy(text: string, key: 'subject' | 'body' | 'both') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-ui-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-ui-border px-5 py-3">
          <h3 className="text-sm font-semibold text-ui-text">
            Черновик письма {draft?.company_name ? `— ${draft.company_name}` : ''}
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
          {loading && (
            <div className="space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-ui-border" />
              <div className="h-3 w-full animate-pulse rounded bg-ui-surface-2" />
              <div className="h-3 w-11/12 animate-pulse rounded bg-ui-surface-2" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-ui-surface-2" />
              <p className="mt-3 text-xs text-ui-text-muted">
                Генерим письмо через LLM. Обычно 5-15 секунд.
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-v2-sm border border-[color:var(--signal-hot)]/30 bg-[var(--signal-hot-bg)] px-3 py-2 text-sm text-[color:var(--signal-hot)]">
              {error}
            </div>
          )}

          {!loading && !error && draft && (
            <div className="space-y-4">
              {draft.used_pains.length > 0 && (
                <div className="rounded-v2-sm border border-[color:var(--signal-warm)]/30 bg-[var(--signal-warm-bg)] px-3 py-2">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--signal-warm)]">
                    Основано на болях
                  </div>
                  <ul className="space-y-1.5">
                    {draft.used_pains.map((p) => (
                      <li key={p.pain_tag_id} className="text-xs">
                        <span className="font-medium text-[color:var(--signal-warm)]">
                          {p.label}
                        </span>
                        {p.top_quote && (
                          <div className="mt-0.5 flex items-start gap-1 text-ui-text">
                            <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--signal-warm)]" />
                            <span className="italic">«{p.top_quote}»</span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {draft.suggested_to_emails.length > 0 && (
                <div className="text-xs text-ui-text-muted">
                  <span className="font-medium text-ui-text">Email-адреса с сайта:</span>{' '}
                  {draft.suggested_to_emails.map((e, i) => (
                    <span key={e}>
                      <a href={`mailto:${e}`} className="text-ui-success hover:underline">
                        {e}
                      </a>
                      {i < draft.suggested_to_emails.length - 1 && ', '}
                    </span>
                  ))}
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                    Тема
                  </label>
                  <button
                    onClick={() => copy(draft.subject, 'subject')}
                    className="inline-flex items-center gap-1 text-xs text-ui-text-muted hover:text-ui-text"
                  >
                    <Copy className="h-3 w-3" />
                    {copied === 'subject' ? 'скопировано' : 'копировать'}
                  </button>
                </div>
                <div className="rounded-md border border-ui-border bg-ui-surface-2 px-3 py-2 text-sm text-ui-text">
                  {draft.subject}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                    Текст
                  </label>
                  <button
                    onClick={() => copy(draft.body, 'body')}
                    className="inline-flex items-center gap-1 text-xs text-ui-text-muted hover:text-ui-text"
                  >
                    <Copy className="h-3 w-3" />
                    {copied === 'body' ? 'скопировано' : 'копировать'}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-md border border-ui-border bg-ui-surface px-3 py-2 font-sans text-sm text-ui-text">
                  {draft.body}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ui-border bg-ui-surface-2 px-5 py-3">
          <span className="text-xs text-ui-text-muted">
            Черновик написан AI — перечитайте перед отправкой.
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            {draft && (
              <button
                onClick={() => copy(`${draft.subject}\n\n${draft.body}`, 'both')}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ui-border bg-ui-surface px-3 py-1.5 text-sm font-medium text-ui-text hover:bg-ui-surface-2"
              >
                <Copy className="h-4 w-4" />
                {copied === 'both' ? 'Скопировано' : 'Скопировать всё'}
              </button>
            )}
            {draft && draft.suggested_to_emails.length > 0 && (
              <a
                href={`mailto:${draft.suggested_to_emails[0]}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ui-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-ui-accent-hover"
              >
                <Mail className="h-4 w-4" />
                Открыть в почтовом клиенте
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
