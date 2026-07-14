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
  updateKpDraft,
  type KpArgumentsUsed,
  type KpDraft,
  type KpTemplate,
  type KpTone,
} from '@/src/services/api/outreach-kp';
import {
  getCompanyDetail,
  type CompanyPainOut,
} from '@/src/services/api/maps';
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
  // 2026-07-11 «4 хода»: новый промпт-каркас с справочниками.
  // 2026-07-14: UI-блок задизейблен (пометка «beta, временно выключен»),
  // поэтому setter'ов нет — payload всегда отдаёт use_4hods=false.
  const [use4hods] = useState(false);
  const [channel] = useState<'messenger' | 'email'>('email');
  const [myOfferStep] = useState('созвон 10 минут');

  const [draft, setDraft] = useState<KpDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'subject' | 'body' | 'both' | null>(null);
  // 2026-07-11 multi-pain: чекбоксы с болями компании. Загружается один
  // раз при открытии modal'ки (для company_id). Для site_lead_id — пусто.
  // selectedPainIds по умолчанию содержит топ-1 (первый в списке) чтобы
  // поведение совпадало со старым — 1 боль автоматически.
  const [availablePains, setAvailablePains] = useState<CompanyPainOut[]>([]);
  const [painsLoading, setPainsLoading] = useState(false);
  const [selectedPainIds, setSelectedPainIds] = useState<number[]>([]);
  // 2026-07-14 своя боль: юзер жмёт «+ Создать свою боль», раскрывается
  // форма (label + description). Кнопка «Создать» переводит форму в
  // «сохранённую» — тогда при генерации отправим её в payload.custom_pain.
  // Хранится только одна одновременно; повторный клик «редактировать» —
  // возвращает форму. Reset на закрытии модалки.
  const [customPainOpen, setCustomPainOpen] = useState(false);
  const [customPainLabelInput, setCustomPainLabelInput] = useState('');
  const [customPainDescriptionInput, setCustomPainDescriptionInput] = useState('');
  const [customPainSaved, setCustomPainSaved] = useState<
    { label: string; description: string } | null
  >(null);
  // Edit-режим: subject/body можно править прямо в модалке поверх
  // AI-генерации. editSubject/editBody — локальные значения textarea;
  // dirty=true если есть несохранённые изменения; saveState управляет
  // кнопкой «Сохранить» (idle/saving/saved/error).
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    draft != null &&
    (editSubject.trim() !== (draft.subject || '').trim() ||
      editBody.trim() !== (draft.body || '').trim());

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
      setEditSubject('');
      setEditBody('');
      setSaveState('idle');
      setSaveError(null);
      setAvailablePains([]);
      setSelectedPainIds([]);
      setCustomPainOpen(false);
      setCustomPainLabelInput('');
      setCustomPainDescriptionInput('');
      setCustomPainSaved(null);
    }
  }, [open]);

  // Подгружаем боли компании при открытии — для чекбоксов выбора.
  // site_lead_id-ветка — скипаем (там нет отзывов).
  useEffect(() => {
    if (!open || targetCompanyId == null) return;
    let cancelled = false;
    setPainsLoading(true);
    getCompanyDetail(targetCompanyId)
      .then((detail) => {
        if (cancelled) return;
        const pains = detail.top_pains ?? [];
        setAvailablePains(pains);
        // Дефолт: отметить топ-1 (первую в списке — уже отсортирован
        // по mention_count desc на бэке). Если список пуст — [].
        setSelectedPainIds(pains.length > 0 ? [pains[0].pain_tag_id] : []);
      })
      .catch(() => {
        // Молча — чекбоксы просто не покажутся, старая логика (топ-1
        // автоматически на бэке) отработает как и раньше.
      })
      .finally(() => {
        if (!cancelled) setPainsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, targetCompanyId]);

  // При смене draft — синхронизируем edit-поля с сервером.
  useEffect(() => {
    if (draft) {
      setEditSubject(draft.subject || '');
      setEditBody(draft.body || '');
      setSaveState('idle');
      setSaveError(null);
    }
  }, [draft]);

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
      // 2026-07-11 multi-pain: передаём только если юзер выбрал ЯВНО
      // (иначе бэк возьмёт топ-1 автоматически — старое поведение).
      pain_tag_ids:
        targetCompanyId != null && selectedPainIds.length > 0
          ? selectedPainIds
          : null,
      // 2026-07-11 «4 хода»: включается юзером в модалке.
      use_4hods: use4hods,
      channel: use4hods ? channel : undefined,
      my_offer_step: use4hods ? myOfferStep.trim() || null : null,
      // 2026-07-14 своя боль: только если юзер её создал и сохранил
      // (нажал «Создать» в форме). Пустая незакоммиченная форма —
      // игнорируется.
      custom_pain: customPainSaved,
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
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[KpModal] /outreach/kp/generate failed', {
          status,
          payload,
          response: respData,
        });
      }
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

  async function handleSave() {
    if (!draft || !dirty || saveState === 'saving') return;
    const subjectClean = editSubject.trim();
    const bodyClean = editBody.trim();
    if (!subjectClean || !bodyClean) {
      setSaveState('error');
      setSaveError('Тема и тело не должны быть пустыми.');
      return;
    }
    setSaveState('saving');
    setSaveError(null);
    try {
      const updated = await updateKpDraft(draft.id, {
        subject: subjectClean,
        body: bodyClean,
      });
      setDraft(updated);
      setSaveState('saved');
      // через 2 сек прячем «Сохранено» и возвращаем idle, чтобы юзер
      // мог нажать «Сохранить» снова после новой правки.
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail || e?.message || 'Не удалось сохранить.';
      setSaveState('error');
      setSaveError(detail);
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

          {/* 2026-07-11 multi-pain: чекбоксы с топ-болями компании.
              До 3 отмеченных — иначе письмо превратится в простыню.
              Только для company-ветки (site_lead КП не имеет отзывов). */}
          {targetCompanyId != null && !painsLoading && availablePains.length > 0 && (
            <div className="mt-4">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Боли для КП{' '}
                <span className="normal-case text-[10px] text-slate-400">
                  · выбрано {selectedPainIds.length} из 3 макс
                  {availablePains.length > 6 && ` · всего у компании ${availablePains.length}`}
                </span>
              </label>
              <div
                className="space-y-1.5 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/30"
                style={{ maxHeight: '240px' }}
              >
                {availablePains.map((p) => {
                  const checked = selectedPainIds.includes(p.pain_tag_id);
                  const atLimit = !checked && selectedPainIds.length >= 3;
                  return (
                    <label
                      key={p.pain_tag_id}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-[12px] transition-colors',
                        checked
                          ? 'bg-violet-100 dark:bg-violet-900/30'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/40',
                        atLimit && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={atLimit}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPainIds((prev) => [...prev, p.pain_tag_id]);
                          } else {
                            setSelectedPainIds((prev) =>
                              prev.filter((id) => id !== p.pain_tag_id),
                            );
                          }
                        }}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-violet-600"
                      />
                      <span className="flex-1">
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {p.label}
                        </span>
                        <span className="ml-1.5 text-slate-500 dark:text-slate-400">
                          · {p.mention_count} упоминаний
                        </span>
                        {p.top_quote && (
                          <span className="block truncate text-[11px] italic text-slate-500 dark:text-slate-400">
                            «{p.top_quote.slice(0, 90)}
                            {p.top_quote.length > 90 ? '…' : ''}»
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {selectedPainIds.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  Выбрана 0 болей — КП сгенерируется «общим» по шаблону.
                </p>
              )}
            </div>
          )}

          {/* 2026-07-14: «Создать свою боль» — юзер вводит label + description,
              LLM пишет КП именно по этому описанию (плюс к выбранным
              AI-болям, если они есть). Работает только в company-ветке;
              для site_lead КП боли не применяются. */}
          {targetCompanyId != null && (
            <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50/40 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              {!customPainOpen && !customPainSaved && (
                <button
                  type="button"
                  onClick={() => setCustomPainOpen(true)}
                  className="text-[12px] font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300"
                >
                  + Создать свою боль
                </button>
              )}
              {customPainOpen && !customPainSaved && (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Название
                    </label>
                    <input
                      type="text"
                      value={customPainLabelInput}
                      onChange={(e) => setCustomPainLabelInput(e.target.value)}
                      placeholder="Например: долго отвечают в WhatsApp"
                      maxLength={120}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Описание — LLM напишет КП по нему
                    </label>
                    <textarea
                      value={customPainDescriptionInput}
                      onChange={(e) => setCustomPainDescriptionInput(e.target.value)}
                      rows={3}
                      maxLength={1200}
                      placeholder="1–4 предложения: в чём именно проблема, как это выглядит у клиентов, чем оборачивается. Опиши так, будто рассказываешь коллеге."
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        customPainLabelInput.trim().length < 2
                        || customPainDescriptionInput.trim().length < 10
                      }
                      onClick={() => {
                        setCustomPainSaved({
                          label: customPainLabelInput.trim(),
                          description: customPainDescriptionInput.trim(),
                        });
                        setCustomPainOpen(false);
                      }}
                      className="rounded-md bg-violet-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Создать
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPainOpen(false);
                        setCustomPainLabelInput('');
                        setCustomPainDescriptionInput('');
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Отмена
                    </button>
                    <span className="ml-auto text-[10px] text-slate-500 dark:text-slate-400">
                      минимум 2 симв. + 10 симв.
                    </span>
                  </div>
                </div>
              )}
              {customPainSaved && (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-wide text-violet-700 dark:text-violet-300">
                      Своя боль (уйдёт в КП)
                    </div>
                    <div className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                      {customPainSaved.label}
                    </div>
                    <div className="text-[11px] italic text-slate-600 dark:text-slate-400">
                      {customPainSaved.description}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPainLabelInput(customPainSaved.label);
                        setCustomPainDescriptionInput(customPainSaved.description);
                        setCustomPainSaved(null);
                        setCustomPainOpen(true);
                      }}
                      className="text-[11px] text-violet-700 hover:text-violet-900 dark:text-violet-300"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPainSaved(null);
                        setCustomPainLabelInput('');
                        setCustomPainDescriptionInput('');
                      }}
                      className="text-[11px] text-slate-500 hover:text-rose-700 dark:text-slate-400"
                    >
                      Убрать
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2026-07-11 «4 хода» — новый промпт-каркас (боль→последствие→
              решение→микрошаг) + валидация выхода + справочники под тему
              «автоматизация связи». 2026-07-14: временно задизейблен как
              бета — блок серый, некликаемый, не выделяется. */}
          <div
            aria-disabled
            className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-100/60 p-3 pointer-events-none select-none opacity-60 dark:border-slate-700 dark:bg-slate-800/40"
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={false}
                readOnly
                disabled
                className="mt-0.5 h-4 w-4 accent-slate-400"
              />
              <span className="flex-1 text-[12px] text-slate-500 dark:text-slate-400">
                <span className="font-medium">Промпт «4 хода»</span>
                <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  beta
                </span>
                <span className="ml-1">· ТЗ 2026-07-11 · временно выключен</span>
                <span className="block text-[11px]">
                  Каркас: наблюдение → что стоит клиенту → решение результатом (без техник) → микрошаг.
                </span>
              </span>
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
              {/* Subject — editable input */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Тема · можно править
                  </label>
                  <button
                    onClick={() => copy(editSubject, 'subject')}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <Copy className="h-3 w-3" />
                    {copied === 'subject' ? 'скопировано' : 'копировать'}
                  </button>
                </div>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Body — editable textarea */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Текст · можно править
                  </label>
                  <button
                    onClick={() => copy(editBody, 'body')}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <Copy className="h-3 w-3" />
                    {copied === 'body' ? 'скопировано' : 'копировать'}
                  </button>
                </div>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={Math.min(20, Math.max(8, editBody.split('\n').length + 1))}
                  className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 font-sans text-sm leading-relaxed text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Save bar */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!dirty || saveState === 'saving'}
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveState === 'saving' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Сохраняю…
                    </>
                  ) : saveState === 'saved' ? (
                    <>Сохранено ✓</>
                  ) : (
                    <>Сохранить правки</>
                  )}
                </button>
                {dirty && saveState !== 'saving' && (
                  <span className="text-[11px] text-amber-700 dark:text-amber-400">
                    Есть несохранённые изменения
                  </span>
                )}
                {saveState === 'error' && saveError && (
                  <span className="text-[11px] text-rose-700 dark:text-rose-300">
                    {saveError}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">
                  Сохранённая версия попадёт в Историю → КП.
                </span>
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
                  copy(`${editSubject}\n\n${editBody}`, 'both')
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
  // 2026-07-11 multi-pain: приоритет args.pains (список), fallback на
  // плоские pain_label/quote для legacy-КП сгенерированных до фичи.
  const painsList =
    args.pains && args.pains.length > 0
      ? args.pains
      : args.pain_label
        ? [
            {
              pain_tag_id: null,
              label: args.pain_label,
              top_quote: args.quote,
              mention_count: args.mention_count,
              source: args.source,
            },
          ]
        : [];
  const hasTrend = !!args.trend_phrase;
  const hasBenchmark = !!args.benchmark_phrase;
  const hasCustomPain = !!args.custom_pain?.label;
  if (painsList.length === 0 && !hasTrend && !hasBenchmark && !hasCustomPain) return null;

  const sourceLabelOf = (src: string | null | undefined) =>
    src === '2gis'
      ? '2GIS'
      : src === 'yandex_maps'
        ? 'Я.Карты'
        : src === 'google'
          ? 'Google'
          : null;

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 dark:border-violet-700/40 dark:bg-violet-900/20">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
        На чём построено письмо
        {painsList.length > 1 && (
          <span className="ml-1.5 rounded-full bg-violet-200 px-1.5 py-0.5 text-[9px] normal-case text-violet-900 dark:bg-violet-800 dark:text-violet-100">
            {painsList.length} болей
          </span>
        )}
      </div>
      <ul className="space-y-2 text-[12px] text-slate-700 dark:text-slate-200">
        {painsList.map((p, idx) => {
          const src = sourceLabelOf(p.source);
          return (
            <li key={`pain-${p.pain_tag_id ?? idx}`} className="border-l-2 border-violet-300 pl-2 dark:border-violet-700">
              <div>
                <span className="font-medium">Боль:</span> {p.label}
                {p.mention_count != null && p.mention_count > 0 && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {' '}
                    · {p.mention_count} упоминаний
                  </span>
                )}
              </div>
              {p.top_quote && (
                <div className="mt-0.5 flex items-start gap-1.5">
                  <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
                  <span className="italic">
                    «{p.top_quote}»
                    {src && (
                      <span className="ml-1 not-italic text-slate-500 dark:text-slate-400">
                        · {src}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </li>
          );
        })}
        {hasCustomPain && (
          <li className="border-l-2 border-emerald-400 pl-2">
            <div>
              <span className="font-medium">Своя боль (от отправителя):</span>{' '}
              {args.custom_pain!.label}
            </div>
            <div className="mt-0.5 flex items-start gap-1.5">
              <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
              <span className="italic">{args.custom_pain!.description}</span>
            </div>
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
