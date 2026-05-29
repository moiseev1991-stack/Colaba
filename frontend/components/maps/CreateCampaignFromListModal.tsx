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
import Link from 'next/link';
import { useState } from 'react';

import { createCampaignFromList, type CreateCampaignFromListOut } from '@/src/services/api/leadLists';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Кампания из списка «{listName}» ({itemsCount} компаний)
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {result ? (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <div className="font-medium">Кампания #{result.campaign_id} создана</div>
                <div className="mt-1 text-emerald-700">
                  Получателей: {result.total_recipients}.{' '}
                  {result.skipped_no_email > 0 && (
                    <>
                      Пропущено без email: {result.skipped_no_email} (краулер сайта ещё не отработал
                      или сайта нет).
                    </>
                  )}
                </div>
              </div>
              <div className="text-sm text-slate-600">
                Чтобы запустить рассылку — перейди в раздел{' '}
                <Link href="/app/email/campaigns" className="text-slate-900 underline">
                  кампании
                </Link>
                .
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Название кампании (внутреннее)
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Тема письма
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Текст письма
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-[13px] outline-none focus:border-slate-500"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Плейсхолдеры: <code>{'{company_name}'}</code> <code>{'{city}'}</code>{' '}
                  <code>{'{niche}'}</code> <code>{'{top_pain}'}</code>{' '}
                  <code>{'{pain_quote}'}</code>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={autoPersonalize}
                  onChange={(e) => setAutoPersonalize(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Подставлять реальные значения вместо плейсхолдеров
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {result ? (
            <button
              onClick={onClose}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Закрыть
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
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
