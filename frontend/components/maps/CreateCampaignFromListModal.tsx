'use client';

/**
 * Модал «Создать кампанию из списка».
 *
 * Шаблон письма поддерживает плейсхолдеры:
 *   {company_name}, {city}, {niche}, {top_pain}, {pain_quote}
 *
 * При создании бэк подставляет реальные значения для каждой компании
 * и создаёт EmailLog (status=pending). Дальше пользователь идёт в
 * /app/email или /app/runs запускать рассылку.
 */

import { Mail, X } from 'lucide-react';
import { pluralRu } from '@/lib/utils';
import Link from 'next/link';
import { useState } from 'react';

import {
  createCampaignFromList,
  type CreateCampaignFromListOut,
} from '@/src/services/api/leadLists';

interface Props {
  open: boolean;
  listId: number;
  listName: string;
  itemsCount: number;
  onClose: () => void;
}

const DEFAULT_SUBJECT = '{company_name} — про отзывы клиентов';
const DEFAULT_BODY =
  `Здравствуйте!\n\n` +
  `Просматривал отзывы клиентов на {company_name} в открытых источниках. ` +
  `Заметил, что регулярно встречается одна тема — "{top_pain}".\n\n` +
  `Один из клиентов писал: «{pain_quote}»\n\n` +
  `У меня есть способ помочь с этой ситуацией — без долгих внедрений и больших бюджетов. ` +
  `Расскажу за 15 минут на коротком созвоне, если интересно — ответьте, пожалуйста, на это письмо.\n\n` +
  `С уважением`;

export function CreateCampaignFromListModal({
  open,
  listId,
  listName,
  itemsCount,
  onClose,
}: Props) {
  const [name, setName] = useState(`Кампания из «${listName}»`);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [autoPersonalize, setAutoPersonalize] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateCampaignFromListOut | null>(null);

  if (!open) return null;

  async function submit() {
    if (!subject.trim() || !body.trim() || !name.trim()) {
      setError('Заполни название, тему и текст');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const out = await createCampaignFromList(listId, {
        name,
        subject,
        body,
        auto_personalize: autoPersonalize,
      });
      setResult(out);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Не удалось создать кампанию';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-ui-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-ui-border px-5 py-3">
          <h3 className="text-sm font-semibold text-ui-text">
            Кампания из списка «{listName}» ({itemsCount}{' '}
            {pluralRu(itemsCount, ['компания', 'компании', 'компаний'])})
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
          {result ? (
            <div className="space-y-4">
              <div className="rounded-v2-sm border border-[color:var(--signal-good)]/30 bg-[var(--signal-good-bg)] px-4 py-3 text-sm text-[color:var(--signal-good)]">
                <div className="font-medium">Кампания #{result.campaign_id} создана</div>
                <div className="mt-1 opacity-90">
                  Получателей: {result.total_recipients}.{' '}
                  {result.skipped_no_email > 0 && (
                    <>
                      Пропущено без email: {result.skipped_no_email} (краулер сайта ещё не отработал
                      или сайта нет).
                    </>
                  )}
                </div>
              </div>
              <div className="text-sm text-ui-text-muted">
                Чтобы запустить рассылку — перейди в раздел{' '}
                <Link href="/app/email/campaigns" className="text-ui-text underline">
                  кампании
                </Link>
                .
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {error && (
                <div className="rounded-v2-sm border border-[color:var(--signal-hot)]/30 bg-[var(--signal-hot-bg)] px-3 py-2 text-sm text-[color:var(--signal-hot)]">
                  {error}
                </div>
              )}
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                  Название кампании (внутреннее)
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ui-border px-2 py-1.5 text-sm outline-none focus:border-ui-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                  Тема письма
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ui-border px-2 py-1.5 text-sm outline-none focus:border-ui-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ui-text-muted">
                  Текст письма
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="mt-1 w-full rounded-md border border-ui-border px-2 py-1.5 font-mono text-small outline-none focus:border-ui-accent"
                />
                <div className="mt-1 text-xs text-ui-text-muted">
                  Плейсхолдеры: <code>{'{company_name}'}</code> <code>{'{city}'}</code>{' '}
                  <code>{'{niche}'}</code> <code>{'{top_pain}'}</code> <code>{'{pain_quote}'}</code>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ui-text">
                <input
                  type="checkbox"
                  checked={autoPersonalize}
                  onChange={(e) => setAutoPersonalize(e.target.checked)}
                  className="rounded border-ui-border"
                />
                Подставлять реальные значения вместо плейсхолдеров
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ui-border bg-ui-surface-2 px-5 py-3">
          {result ? (
            <button
              onClick={onClose}
              className="rounded-full bg-ui-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-ui-accent-hover"
            >
              Закрыть
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-md border border-ui-border bg-ui-surface px-3 py-1.5 text-sm font-medium text-ui-text hover:bg-ui-surface-2"
              >
                Отмена
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-ui-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-ui-accent-hover disabled:opacity-50"
              >
                <Mail className="h-4 w-4" />
                {saving ? 'Создаём…' : 'Создать кампанию'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
