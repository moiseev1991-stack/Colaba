'use client';

/**
 * KpModal — модалка генерации КП (Эпик A фокус-релиза «КП-конвейер», ТЗ 2026-06-12).
 *
 * Отличается от старой DraftEmailModal:
 *  - Юзер выбирает ШАБЛОН ОТПРАВИТЕЛЯ (Веб-студия / SEO / Маркетинг / Свой)
 *    вместо «угла услуги». Это меняет sender_profile + offer_hint в промпте.
 *  - Под письмом — блок «Аргументы»: какая боль, цитата из отзыва, тренд,
 *    сравнение с нишей. Юзер видит, на чём построено письмо, и может проверить,
 *    что LLM ничего не выдумала.
 *  - Кнопка «Сгенерировать заново» делает новую запись в kp_drafts (не upsert)
 *    — чтобы юзер мог сравнить варианты.
 *  - Счётчик «Осталось N бесплатных КП» (Эпик E, пока бэк всегда отдаёт null).
 *
 * Используется из:
 *  - MapsSearchResults: кнопка «КП» в строке выдачи (через MapsCompanyCard)
 *  - MapsCompanyDetailDrawer: блок-карточка наверху drawer'а с кнопкой «КП»
 */

import {
  Copy,
  Loader2,
  MessageSquareQuote,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  generateKp,
  listKpTemplates,
  type KpArgumentsUsed,
  type KpDraft,
  type KpTemplate,
  type KpTone,
} from '@/src/services/api/outreach-kp';
import {
  getStoredKpTemplateKey,
  recordOnboardingEvent,
} from '@/lib/onboarding-storage';

interface Props {
  open: boolean;
  /** Принимает ЛИБО companyId (КП по компании из maps), ЛИБО siteLeadId
   *  (КП по найденному сайту, Эпик F). Бэк-валидатор XOR — мы тут не
   *  жёстко форсируем чтобы parent мог переключаться, но передаём в
   *  /outreach/kp/generate именно то, что не null. */
  companyId?: number | null;
  siteLeadId?: number | null;
  /** Имя компании или домен — для шапки модалки. */
  companyName?: string;
  onClose: () => void;
  /** Опционально: какой шаблон выставить по умолчанию (если юзер выбрал
   *  профессию на онбординге — Эпик B). По умолчанию — первый из списка. */
  defaultTemplateKey?: string;
}

const TONE_OPTIONS: { value: KpTone; label: string }[] = [
  { value: 'neutral', label: 'Нейтральный' },
  { value: 'bold', label: 'Уверенный' },
];

export function KpModal({
  open,
  companyId,
  siteLeadId,
  companyName,
  onClose,
  defaultTemplateKey,
}: Props) {
  const targetCompanyId = companyId ?? null;
  const targetSiteLeadId = siteLeadId ?? null;
  const hasTarget = targetCompanyId != null || targetSiteLeadId != null;
  const [templates, setTemplates] = useState<KpTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tone, setTone] = useState<KpTone>('neutral');
  const [customSenderProfile, setCustomSenderProfile] = useState('');

  const [draft, setDraft] = useState<KpDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'subject' | 'body' | 'both' | null>(null);

  const isCustom = selectedKey === 'custom';
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  // На открытии — тянем список шаблонов один раз. Между открытиями переюзаем.
  useEffect(() => {
    if (!open || templates.length > 0) return;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    listKpTemplates()
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);
        // Дефолт: prop defaultTemplateKey → онбординг localStorage →
        // первый системный (обычно webstudio). Эпик B сохраняет выбор
        // профессии в colaba.kp.default_template_key, мы его подбираем.
        const fromOnboarding = getStoredKpTemplateKey();
        const def =
          (defaultTemplateKey && list.find((t) => t.key === defaultTemplateKey)) ||
          (fromOnboarding && list.find((t) => t.key === fromOnboarding)) ||
          list[0] ||
          null;
        setSelectedKey(def?.key ?? null);
      })
      .catch((e: any) => {
        if (!cancelled)
          setTemplatesError(e?.message || 'Не удалось загрузить шаблоны КП');
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // На закрытии — обнуляем результат генерации (но шаблоны кэшируем).
  useEffect(() => {
    if (!open) {
      setDraft(null);
      setError(null);
      setCopied(null);
      setGenerating(false);
    }
  }, [open]);

  async function handleGenerate() {
    if (!hasTarget || !selectedKey || generating) return;
    if (isCustom && !customSenderProfile.trim()) {
      setError(
        'Для шаблона «Свой вариант» опиши, кто ты — 1-2 предложения. ' +
          'Например: «маркетолог-фрилансер, делаю настройку Яндекс.Директа».',
      );
      return;
    }
    setGenerating(true);
    setError(null);
    setCopied(null);
    const payload = {
      // Бэк XOR-валидатор примет ровно одно из двух. parent должен
      // не передавать оба сразу — на тип-уровне мы это не форсим,
      // т.к. parent'у удобнее держать их параллельно.
      company_id: targetCompanyId,
      site_lead_id: targetSiteLeadId,
      template_key: selectedKey,
      tone,
      custom_sender_profile: isCustom ? customSenderProfile.trim() : null,
    };
    try {
      const res = await generateKp(payload);
      setDraft(res);
      // Аналитика «время до первого КП» — фиксируется один раз.
      recordOnboardingEvent('first_kp_generated');
    } catch (e: any) {
      // FastAPI отдаёт детали валидации в response.data.detail —
      // у 422 это массив [{loc,msg,type},...]. Раньше мы показывали
      // общее «Ошибка генерации КП» и юзер не видел конкретики.
      // Теперь склеиваем поле + сообщение в одну строку для UI и
      // дублируем raw payload + response в console.error чтобы можно
      // было быстро посмотреть Network → Console.
      const respData = e?.response?.data;
      const status = e?.response?.status;
      // eslint-disable-next-line no-console
      console.error('[KpModal] /outreach/kp/generate failed', {
        status,
        payload,
        response: respData,
      });
      let msg = '';
      if (respData && Array.isArray(respData.detail)) {
        msg = respData.detail
          .map((d: any) => {
            const path = Array.isArray(d?.loc) ? d.loc.filter((p: any) => p !== 'body').join('.') : '';
            return path ? `${path}: ${d?.msg ?? ''}` : d?.msg ?? '';
          })
          .filter(Boolean)
          .join('; ');
      } else if (typeof respData?.detail === 'string') {
        msg = respData.detail;
      } else if (typeof e?.message === 'string') {
        msg = e.message;
      }
      const prefix = status ? `Ошибка ${status}: ` : '';
      setError((prefix + (msg || 'не удалось сгенерировать КП.')).slice(0, 600));
    } finally {
      setGenerating(false);
    }
  }

  async function copy(text: string, key: 'subject' | 'body' | 'both') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Sparkles className="mr-1.5 inline h-4 w-4 -translate-y-0.5 text-violet-600" />
              КП {companyName ? `— ${companyName}` : ''}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Холодное письмо под боль клиентов из отзывов компании.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Селект шаблона + тон + (custom) поле «о себе» */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Шаблон отправителя
              </label>
              {templatesLoading ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  Загружаю шаблоны…
                </div>
              ) : templatesError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {templatesError}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => {
                    const active = t.key === selectedKey;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setSelectedKey(t.key)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                          active
                            ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                        )}
                        title={t.sender_profile || undefined}
                      >
                        {t.title}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedTemplate && !isCustom && selectedTemplate.sender_profile && (
                <p className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-400">
                  Пишешь от лица: {selectedTemplate.sender_profile}
                </p>
              )}
            </div>

            {isCustom && (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Кто ты — 1-2 предложения
                </label>
                <textarea
                  value={customSenderProfile}
                  onChange={(e) => setCustomSenderProfile(e.target.value)}
                  rows={2}
                  maxLength={600}
                  placeholder="Например: маркетолог-фрилансер, делаю настройку Яндекс.Директа и веду рекламные кампании для малого бизнеса."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Тон письма
              </label>
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/40">
                {TONE_OPTIONS.map((opt) => {
                  const active = opt.value === tone;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTone(opt.value)}
                      className={cn(
                        'rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
                        active
                          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Generate button */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={
                !hasTarget || !selectedKey || generating || templatesLoading
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-600 px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : draft ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating
                ? 'Генерирую…'
                : draft
                  ? 'Сгенерировать заново'
                  : 'Сгенерировать КП'}
            </button>
            {generating && (
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Обычно 5-15 секунд. LLM собирает контекст из отзывов компании.
              </p>
            )}
          </div>

          {/* Error */}
          {error && !generating && (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-200">
              {error}
            </div>
          )}

          {/* Result */}
          {draft && !generating && (
            <div className="mt-4 space-y-3">
              {/* Subject */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Тема
                  </label>
                  <button
                    onClick={() => copy(draft.subject, 'subject')}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <Copy className="h-3 w-3" />
                    {copied === 'subject' ? 'скопировано' : 'копировать'}
                  </button>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {draft.subject}
                </div>
              </div>

              {/* Body */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Текст
                  </label>
                  <button
                    onClick={() => copy(draft.body, 'body')}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <Copy className="h-3 w-3" />
                    {copied === 'body' ? 'скопировано' : 'копировать'}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white px-3 py-2 font-sans text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {draft.body}
                </pre>
              </div>

              {/* Arguments block */}
              <ArgumentsBlock args={draft.arguments_used} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/50">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {draft?.remaining_free != null
              ? `Осталось ${draft.remaining_free} бесплатных КП в месяце.`
              : 'Драфт сгенерирован AI. Перечитай перед отправкой.'}
          </span>
          <div className="flex gap-2">
            {draft && (
              <button
                onClick={() =>
                  copy(`${draft.subject}\n\n${draft.body}`, 'both')
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Copy className="h-4 w-4" />
                {copied === 'both' ? 'Скопировано' : 'Скопировать всё'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArgumentsBlock({ args }: { args: KpArgumentsUsed }) {
  // Показываем только те аргументы, по которым у нас реально есть данные.
  // Без них LLM-промпт строку пропустил — значит и в UI ей не место.
  const hasPain = !!args.pain_label;
  const hasQuote = !!args.quote;
  const hasTrend = !!args.trend_phrase;
  const hasBenchmark = !!args.benchmark_phrase;
  if (!hasPain && !hasQuote && !hasTrend && !hasBenchmark) return null;

  const sourceLabel =
    args.source === '2gis'
      ? '2GIS'
      : args.source === 'yandex_maps'
        ? 'Я.Карты'
        : args.source === 'google'
          ? 'Google'
          : null;

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 dark:border-violet-700/40 dark:bg-violet-900/20">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
        На чём построено письмо
      </div>
      <ul className="space-y-1.5 text-[12px] text-slate-700 dark:text-slate-200">
        {hasPain && (
          <li>
            <span className="font-medium">Боль:</span> {args.pain_label}
            {args.mention_count != null && args.mention_count > 0 && (
              <span className="text-slate-500 dark:text-slate-400">
                {' '}
                · {args.mention_count} упоминаний
              </span>
            )}
          </li>
        )}
        {hasQuote && (
          <li className="flex items-start gap-1.5">
            <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
            <span className="italic">
              «{args.quote}»
              {sourceLabel && (
                <span className="ml-1 not-italic text-slate-500 dark:text-slate-400">
                  · {sourceLabel}
                </span>
              )}
            </span>
          </li>
        )}
        {hasTrend && (
          <li className="flex items-start gap-1.5">
            <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
            <span>{args.trend_phrase}</span>
          </li>
        )}
        {hasBenchmark && (
          <li className="flex items-start gap-1.5">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            <span>{args.benchmark_phrase}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
