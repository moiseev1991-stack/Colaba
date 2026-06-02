'use client';

/**
 * Aha-moment блок 1: секция «Письмо» в drawer карточки компании maps.
 *
 * Что умеет:
 *  - Выбор угла услуги (Сайт / Репутация / Автоматизация / SEO / Авто).
 *  - Кнопка «Сгенерировать письмо» → вызывает POST /outreach-draft, показывает
 *    subject + body в редактируемых полях.
 *  - «Регенерировать» — снова в LLM с regenerate=true (перезаписывает кэш).
 *  - «Копировать всё», «Открыть в почте» (mailto: с подставленным первым email
 *    компании, если есть).
 *  - При первом открытии тянет кэшированный draft с angle='auto' (LLM не
 *    дёргается, если в БД уже что-то лежит на auto-угле — но cached=true).
 *
 * Поведение:
 *  - Если у компании нет pain-тегов и нет email — кнопка активна, письмо
 *    строится только по углу (особенно полезно для website-угла).
 *  - Тёмная тема обязательна (как весь maps-раздел).
 */

import { useState } from 'react';
import { Copy, Mail, RefreshCw, Send, Sparkles } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  generateOutreachDraft,
  type OutreachAngle,
  type OutreachDraftCachedOut,
} from '@/src/services/api/maps';

interface Props {
  companyId: number;
  /** Email-ы компании (первый используется для mailto:). */
  companyEmails?: string[];
}

const ANGLE_OPTIONS: { value: OutreachAngle; label: string; hint: string }[] = [
  { value: 'auto', label: 'Авто', hint: 'сервер выберет угол сам по сигналам' },
  { value: 'website', label: 'Сайт', hint: 'продажа сайта-визитки / лендинга' },
  { value: 'reputation', label: 'Репутация', hint: 'работа с негативом и отзывами' },
  { value: 'automation', label: 'Автоматизация', hint: 'звонки/CRM/чат-бот' },
  { value: 'seo', label: 'SEO', hint: 'продвижение в поиске' },
];

export function OutreachDraftBlock({ companyId, companyEmails }: Props) {
  const [angle, setAngle] = useState<OutreachAngle>('auto');
  const [draft, setDraft] = useState<OutreachDraftCachedOut | null>(null);
  // Локальные edit-копии — юзер может править перед копированием/отправкой.
  const [subjectEdit, setSubjectEdit] = useState('');
  const [bodyEdit, setBodyEdit] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'subject' | 'body' | 'all' | null>(null);

  const firstEmail = companyEmails?.[0];

  async function handleGenerate(regenerate: boolean) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await generateOutreachDraft(companyId, {
        angle,
        regenerate,
      });
      setDraft(res);
      setSubjectEdit(res.subject);
      setBodyEdit(res.body);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'Не удалось сгенерировать письмо';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function copyToClipboard(text: string, what: 'subject' | 'body' | 'all') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard может быть недоступен в инсекьюр-контексте; игнор. */
    }
  }

  function openInMail() {
    if (!firstEmail) return;
    const url =
      `mailto:${encodeURIComponent(firstEmail)}` +
      `?subject=${encodeURIComponent(subjectEdit)}` +
      `&body=${encodeURIComponent(bodyEdit)}`;
    window.location.href = url;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Письмо
        </span>
      </div>

      {/* Селект угла услуги */}
      <div className="mb-2">
        <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Угол услуги
        </label>
        <select
          value={angle}
          onChange={(e) => setAngle(e.target.value as OutreachAngle)}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        >
          {ANGLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} — {o.hint}
            </option>
          ))}
        </select>
      </div>

      {/* Кнопки управления */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleGenerate(false)}
          disabled={isLoading}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60',
            'dark:bg-emerald-700 dark:hover:bg-emerald-600'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isLoading
            ? 'Генерация…'
            : draft
              ? 'Перегенерировать кэш'
              : 'Сгенерировать письмо'}
        </button>
        {draft && (
          <button
            type="button"
            onClick={() => handleGenerate(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Заново вызвать LLM, перезаписать кэш"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Новая версия
          </button>
        )}
      </div>

      {/* Состояние из кэша */}
      {draft?.cached && (
        <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
          Из кэша · угол:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {draft.angle_used}
          </span>
        </div>
      )}
      {draft && !draft.cached && (
        <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
          Сгенерировано · угол:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {draft.angle_used}
          </span>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div className="mb-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Subject + Body */}
      {draft && (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Тема
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={subjectEdit}
                onChange={(e) => setSubjectEdit(e.target.value)}
                className="h-8 flex-1 text-[12px]"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(subjectEdit, 'subject')}
                title="Копировать тему"
                className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            {copied === 'subject' && (
              <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                Скопировано
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Тело
            </label>
            <textarea
              value={bodyEdit}
              onChange={(e) => setBodyEdit(e.target.value)}
              rows={10}
              className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] leading-relaxed text-slate-800 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(bodyEdit, 'body')}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Copy className="h-3 w-3" />
                Тело
              </button>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `Тема: ${subjectEdit}\n\n${bodyEdit}`,
                    'all',
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Copy className="h-3 w-3" />
                Всё
              </button>
              {firstEmail ? (
                <button
                  type="button"
                  onClick={openInMail}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2 py-1 text-[11px] text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                  title={`Открыть в почтовом клиенте, адрес: ${firstEmail}`}
                >
                  <Mail className="h-3 w-3" />
                  Открыть в почте
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                  <Send className="h-3 w-3" />
                  email не найден — скопируй вручную
                </span>
              )}
              {(copied === 'body' || copied === 'all') && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  Скопировано
                </span>
              )}
            </div>
          </div>

          {/* Какие боли пошли в письмо */}
          {draft.pains_used && draft.pains_used.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Боли в письме:
              </div>
              <div className="flex flex-wrap gap-1">
                {draft.pains_used.map((p) => (
                  <span
                    key={p.pain_tag_id}
                    className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                    title={p.top_quote ?? undefined}
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Пустое состояние */}
      {!draft && !isLoading && !error && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Выбери угол услуги и жми «Сгенерировать». Письмо построится из
          реальных болей клиентов этой компании (если они есть) или из угла
          услуги.
        </div>
      )}
    </div>
  );
}
